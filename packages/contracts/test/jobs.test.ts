import { describe, expect, it } from "vitest";
import {
  JobImportSchema,
  JobListQuerySchema,
  OfferBiuBridgeBatchSchema,
  OfferBiuBridgeSessionSchema,
  StoredJobSchema,
} from "../src/index.js";

describe("job discovery contracts", () => {
  const capturedAt = "2026-07-17T10:00:00.000Z";

  it("accepts a complete public job import", () => {
    const imported = JobImportSchema.parse({
      jobs: [{
        source: "manual",
        sourceJobId: "public-url-1",
        sourceUrl: "https://careers.example.com/jobs/1",
        title: "前端开发实习生",
        company: "示例科技",
        location: "上海",
        description: "参与本地 Web 应用开发。",
        capturedAt,
      }],
    });

    expect(imported.jobs).toHaveLength(1);
    expect(StoredJobSchema.parse({
      id: "018a2c8a-51dc-7a81-a240-000000000001",
      fingerprint: "a".repeat(64),
      status: "active",
      firstCapturedAt: capturedAt,
      lastCapturedAt: capturedAt,
      sources: imported.jobs,
      ...imported.jobs[0],
    }).company).toBe("示例科技");
  });

  it("rejects an unsafe list page size", () => {
    expect(() => JobListQuerySchema.parse({ pageSize: 101 })).toThrow(/pageSize/i);
  });

  it("accepts one bounded OfferBiu bridge page and strips unknown fields", () => {
    const parsed = OfferBiuBridgeBatchSchema.parse({
      syncId: "018a2c8a-51dc-7a81-a240-000000000001",
      seasonYear: 2027,
      page: 0,
      totalPages: 313,
      records: [{
        id: "rec-1",
        companyName: "示例半导体",
        positionsText: "验证工程师",
        locations: ["上海"],
        targetYears: [2027],
        applyUrl: "https://example.com/jobs/1",
        authorization: "Bearer must-be-dropped",
      }],
    });

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).not.toHaveProperty("authorization");
    expect(OfferBiuBridgeSessionSchema.parse({ token: "a".repeat(43) }).token).toHaveLength(43);
  });

  it("rejects oversized or internally inconsistent OfferBiu bridge pages", () => {
    const record = { id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师" };
    expect(() => OfferBiuBridgeBatchSchema.parse({
      syncId: "018a2c8a-51dc-7a81-a240-000000000001",
      seasonYear: 2027,
      page: 2,
      totalPages: 2,
      records: [record],
    })).toThrow();
    expect(() => OfferBiuBridgeBatchSchema.parse({
      syncId: "018a2c8a-51dc-7a81-a240-000000000001",
      seasonYear: 2027,
      page: 0,
      totalPages: 2,
      records: Array.from({ length: 51 }, () => record),
    })).toThrow();
  });
});
