import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, JobListSchema, ScanResultSchema } from "@campus-job-agent/contracts";
import { JobRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { JobsService } from "../src/jobs-service.js";
import type { CompanyJobSyncService } from "../src/company-job-sync-service.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];
const job = {
  source: "manual",
  sourceJobId: "123",
  sourceUrl: "https://careers.example.com/jobs/123",
  title: "前端开发实习生",
  company: "示例科技",
  location: "上海",
  description: "参与本地 Web 应用开发。",
  capturedAt: "2026-07-17T10:00:00.000Z",
};

async function setup(companyJobSync?: CompanyJobSyncService) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-job-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const jobs = new JobsService({ repository: new JobRepository(storage.db) });
  const app = buildApp({ jobs, companyJobSync, allowedOrigins: new Set([ORIGIN]) });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("job discovery routes", () => {
  it("imports a generic job, then lists it without an origin on reads", async () => {
    const app = await setup();
    const imported = await app.inject({ method: "POST", url: "/api/jobs/import", headers: { origin: ORIGIN }, payload: { jobs: [job] } });

    expect(imported.statusCode).toBe(201);
    expect(ScanResultSchema.parse(imported.json())).toMatchObject({ source: "manual", fetched: 1, created: 1 });
    const listed = await app.inject({ method: "GET", url: "/api/jobs?keyword=%E5%89%8D%E7%AB%AF&city=%E4%B8%8A%E6%B5%B7" });
    expect(JobListSchema.parse(listed.json())).toMatchObject({ total: 1, jobs: [expect.objectContaining({ title: "前端开发实习生" })] });
  });

  it("does not expose the removed Tencent scan or source-status routes", async () => {
    const app = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/jobs/scan/tencent", headers: { origin: ORIGIN } });
    const sources = await app.inject({ method: "GET", url: "/api/sources" });

    expect(scan.statusCode).toBe(404);
    expect(sources.statusCode).toBe(404);
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

  it("returns 404 for an unknown specialized import route", async () => {
    const app = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/import/unknown-source",
      headers: { origin: ORIGIN },
      payload: { records: [] },
    });

    expect(response.statusCode).toBe(404);
  });

  it("exposes manual official-company synchronization without applying to jobs", async () => {
    const sync = vi.fn(async () => ({ sourcesSelected: 0, sourcesSucceeded: 0, sourcesSkipped: 0, sourcesFailed: 0, jobsFetched: 0, created: 0, updated: 0, completedAt: "2026-07-18T08:00:00.000Z" }));
    const app = await setup({ sync } as unknown as CompanyJobSyncService);
    const response = await app.inject({ method: "POST", url: "/api/companies/jobs/sync", headers: { origin: ORIGIN }, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(sync).toHaveBeenCalledWith({});
  });
});
