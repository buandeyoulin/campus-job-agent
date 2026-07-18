import { beforeAll, describe, expect, it } from "vitest";

interface BridgeCore {
  sanitizePosting(value: unknown): Record<string, unknown> | null;
  validateBatch(value: unknown): boolean;
  pageNumbers(totalPages: unknown): number[];
  summarizeImport(batch: unknown, result: unknown): { seen: number; imported: number; created: number; updated: number; skipped: number } | null;
}

let core: BridgeCore;

beforeAll(async () => {
  await import("../extension/core.js");
  core = (globalThis as typeof globalThis & { OfferBiuBridgeCore: BridgeCore }).OfferBiuBridgeCore;
});

describe("OfferBiu bridge core", () => {
  it("projects postings through an explicit whitelist", () => {
    expect(core.sanitizePosting({
      id: "rec-1",
      companyName: "示例半导体",
      positionsText: "验证工程师",
      locations: ["上海"],
      authorization: "Bearer secret",
      cookie: "secret",
      accessToken: "secret",
      unexpected: "x",
    })).toEqual({
      id: "rec-1",
      companyName: "示例半导体",
      positionsText: "验证工程师",
      locations: ["上海"],
    });
  });

  it("validates bounded zero-based page batches", () => {
    expect(core.validateBatch({
      syncId: "018a2c8a-51dc-7a81-a240-000000000001",
      seasonYear: 2027,
      page: 0,
      totalPages: 2,
      records: [{ id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师" }],
    })).toBe(true);
    expect(core.validateBatch({ syncId: "bad", seasonYear: 2027, page: 2, totalPages: 2, records: [] })).toBe(false);
  });

  it("builds a bounded zero-based page sequence", () => {
    expect(core.pageNumbers(3)).toEqual([0, 1, 2]);
    expect(core.pageNumbers(0)).toEqual([]);
    expect(core.pageNumbers(10_001)).toEqual([]);
  });

  it("derives stored and skipped counts only from a valid server acknowledgement", () => {
    const batch = {
      syncId: "018a2c8a-51dc-7a81-a240-000000000001",
      seasonYear: 2027,
      page: 0,
      totalPages: 1,
      records: [
        { id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师" },
        { id: "rec-2", companyName: "示例半导体", positionsText: "设计工程师" },
      ],
    };
    expect(core.summarizeImport(batch, { fetched: 1, created: 1, updated: 0 })).toEqual({
      seen: 2,
      imported: 1,
      created: 1,
      updated: 0,
      skipped: 1,
    });
    expect(core.summarizeImport(batch, { fetched: 3, created: 3, updated: 0 })).toBeNull();
  });
});
