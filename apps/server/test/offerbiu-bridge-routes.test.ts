import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  JobListSchema,
  OfferBiuBridgeSessionSchema,
  ScanResultSchema,
} from "@campus-job-agent/contracts";
import { JobRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { JobsService } from "../src/jobs-service.js";
import { OfferBiuBridgeService } from "../src/offerbiu-bridge-service.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];

const batch = {
  syncId: "018a2c8a-51dc-7a81-a240-000000000001",
  seasonYear: 2027,
  page: 0,
  totalPages: 2,
  records: [{
    id: "rec-bridge-1",
    companyName: "示例半导体",
    companyNature: "民企",
    industry: "电子/半导体",
    recruitType: "秋招",
    targetYears: [2027],
    locations: ["上海"],
    positionsText: "数字 IC 验证工程师",
    deadlineText: "招满为止",
    announcementUrl: "https://news.example.com/rec-bridge-1",
    applyUrl: "https://careers.example.com/rec-bridge-1",
    examPolicy: "需要笔试",
    noteText: "",
    sourceUpdatedAt: "2026-07-17T16:00:00Z",
    seasonYear: 2027,
    credential: "must-not-cross-the-bridge",
  }],
};

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-offerbiu-bridge-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const jobs = new JobsService({
    repository: new JobRepository(storage.db),
    fetchTencent: async () => [],
    fetchOfferBiu: async () => [],
  });
  const offerBiuBridge = new OfferBiuBridgeService(jobs);
  const app = buildApp({ jobs, offerBiuBridge, allowedOrigins: new Set([ORIGIN]) });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OfferBiu browser session bridge", () => {
  it("issues an ephemeral loopback bridge token", async () => {
    const app = await setup();
    const response = await app.inject({ method: "GET", url: "/api/offerbiu-bridge/session" });

    expect(response.statusCode).toBe(200);
    expect(OfferBiuBridgeSessionSchema.parse(response.json()).token).toHaveLength(43);
  });

  it.each([
    ["missing", undefined],
    ["incorrect", "not-the-process-token"],
  ])("rejects a %s token without requiring a browser origin", async (_label, token) => {
    const app = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/import/offerbiu-bridge",
      headers: token ? { "x-campus-bridge-token": token } : {},
      payload: batch,
    });

    expect(response.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe("bridge_unauthorized");
  });

  it("imports and idempotently updates sanitized OfferBiu records", async () => {
    const app = await setup();
    const session = OfferBiuBridgeSessionSchema.parse((await app.inject({
      method: "GET",
      url: "/api/offerbiu-bridge/session",
    })).json());
    const request = () => app.inject({
      method: "POST",
      url: "/api/jobs/import/offerbiu-bridge",
      headers: { "x-campus-bridge-token": session.token },
      payload: batch,
    });

    const first = await request();
    const replay = await request();

    expect(first.statusCode).toBe(201);
    expect(ScanResultSchema.parse(first.json())).toMatchObject({ source: "offerbiu", fetched: 1, created: 1 });
    expect(ScanResultSchema.parse(replay.json())).toMatchObject({ source: "offerbiu", fetched: 1, created: 0, updated: 1 });

    const listed = await app.inject({ method: "GET", url: "/api/jobs?source=offerbiu" });
    const library = JobListSchema.parse(listed.json());
    expect(library).toMatchObject({
      total: 1,
      jobs: [expect.objectContaining({
        sourceJobId: "rec-bridge-1",
        title: "数字 IC 验证工程师",
        company: "示例半导体",
      })],
    });
    expect(JSON.stringify(library)).not.toContain("must-not-cross-the-bridge");
  });

  it("keeps the token exemption limited to the bridge import route", async () => {
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/jobs/scan/tencent" });

    expect(response.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe("origin_not_allowed");
  });
});
