import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, JobListSchema, ScanResultSchema } from "@campus-job-agent/contracts";
import { JobRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { JobsService } from "../src/jobs-service.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];
const job = {
  source: "tencent",
  sourceJobId: "123",
  sourceUrl: "https://careers.example.com/jobs/123",
  title: "前端开发实习生",
  company: "示例科技",
  location: "上海",
  description: "参与本地 Web 应用开发。",
  capturedAt: "2026-07-17T10:00:00.000Z",
};

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-job-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const jobs = new JobsService({
    repository: new JobRepository(storage.db),
    fetchTencent: async () => [job],
    fetchOfferBiu: async () => [{ ...job, source: "offerbiu", sourceJobId: "offerbiu-1" }],
  });
  const app = buildApp({ jobs, allowedOrigins: new Set([ORIGIN]) });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("job discovery routes", () => {
  it("scans a public source, then lists its stored job without an origin on reads", async () => {
    const app = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/jobs/scan/tencent", headers: { origin: ORIGIN } });

    expect(scan.statusCode).toBe(200);
    expect(ScanResultSchema.parse(scan.json())).toMatchObject({ source: "tencent", fetched: 1, created: 1 });
    const listed = await app.inject({ method: "GET", url: "/api/jobs?keyword=%E5%89%8D%E7%AB%AF&city=%E4%B8%8A%E6%B5%B7" });
    expect(JobListSchema.parse(listed.json())).toMatchObject({ total: 1, jobs: [expect.objectContaining({ title: "前端开发实习生" })] });
  });

  it("scans all OfferBiu recruitment records into the local job library", async () => {
    const app = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/jobs/scan/offerbiu", headers: { origin: ORIGIN } });

    expect(scan.statusCode).toBe(200);
    expect(ScanResultSchema.parse(scan.json())).toMatchObject({ source: "offerbiu", fetched: 1, created: 1 });
    const listed = await app.inject({ method: "GET", url: "/api/jobs?source=offerbiu" });
    expect(JobListSchema.parse(listed.json())).toMatchObject({ total: 1 });
  });

  it("rejects a mutating scan without the configured loopback origin", async () => {
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/jobs/scan/tencent" });

    expect(response.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe("origin_not_allowed");
  });

  it("rejects malformed manual imports without echoing job descriptions", async () => {
    const app = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/import",
      headers: { origin: ORIGIN },
      payload: { jobs: [{ ...job, title: "", description: "不应回显的职位描述" }] },
    });

    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe("validation_failed");
    expect(response.body).not.toContain("不应回显");
  });

  it("imports visible OfferBiu session records into the local job library without credentials", async () => {
    const app = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/import/offerbiu-visible",
      headers: { origin: ORIGIN },
      payload: {
        records: [{
          company: "Example Semiconductor",
          roles: "Digital IC Design Engineer",
          location: "Shanghai",
          industry: "Semiconductor",
          cohort: "2027",
          deadline: "Open until filled",
          requirement: "Campus recruiting",
          applyUrl: "https://careers.example.com/campus/digital-ic",
        }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(ScanResultSchema.parse(response.json())).toMatchObject({ source: "offerbiu-authenticated", fetched: 1, created: 1 });
    const listed = await app.inject({ method: "GET", url: "/api/jobs?source=offerbiu-authenticated" });
    expect(JobListSchema.parse(listed.json())).toMatchObject({
      total: 1,
      jobs: [expect.objectContaining({ company: "Example Semiconductor", sourceUrl: "https://careers.example.com/campus/digital-ic" })],
    });
  });
});
