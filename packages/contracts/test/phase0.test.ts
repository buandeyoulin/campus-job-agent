import { describe, expect, it } from "vitest";
import { NormalizedJobSchema, ProbeResultSchema } from "../src/phase0.js";

describe("Phase 0 contracts", () => {
  it("rejects a probe result without a sanitized summary", () => {
    expect(() => ProbeResultSchema.parse({ name: "x", status: "pass" })).toThrow();
  });

  it("accepts a normalized public job", () => {
    const job = NormalizedJobSchema.parse({
      source: "tencent",
      sourceJobId: "123",
      sourceUrl: "https://careers.tencent.com/jobdesc.html?postId=123",
      title: "软件开发实习生",
      company: "腾讯",
      location: "深圳",
      description: "参与后端服务开发",
      capturedAt: "2026-07-16T00:00:00.000Z"
    });
    expect(job.source).toBe("tencent");
  });
});
