import { describe, expect, it } from "vitest";
import { fingerprintJob, mergeJob, normalizeJob } from "../src/index.js";

const capturedAt = "2026-07-17T10:00:00.000Z";

describe("job normalization", () => {
  it("collapses harmless URL and whitespace variants into one fingerprint", () => {
    const first = normalizeJob({
      source: "official-company",
      sourceJobId: "1",
      sourceUrl: "https://careers.example.com/jobs/1?utm_source=test#top",
      title: "  前端开发\n实习生 ",
      company: " 示例科技 ",
      location: " 上海 ",
      description: "负责  Web\t应用开发。",
      capturedAt,
    });
    const variant = normalizeJob({ ...first, sourceUrl: "https://careers.example.com/jobs/1", title: "前端开发实习生" });

    expect(first.sourceUrl).toBe("https://careers.example.com/jobs/1");
    expect(first.title).toBe("前端开发 实习生");
    expect(fingerprintJob(first)).toBe(fingerprintJob(variant));
  });

  it("keeps distinct locations separate and preserves an existing id when merging", () => {
    const shanghai = normalizeJob({
      source: "official-company",
      sourceJobId: "1",
      sourceUrl: "https://careers.example.com/jobs/1",
      title: "前端开发实习生",
      company: "示例科技",
      location: "上海",
      description: "负责应用开发。",
      capturedAt,
    });
    const beijing = normalizeJob({ ...shanghai, sourceJobId: "2", sourceUrl: "https://careers.example.com/jobs/2", location: "北京" });
    const existing = {
      id: "018a2c8a-51dc-7a81-a240-000000000001",
      fingerprint: fingerprintJob(shanghai),
      status: "active" as const,
      firstCapturedAt: capturedAt,
      lastCapturedAt: capturedAt,
      sources: [shanghai],
      ...shanghai,
    };

    expect(fingerprintJob(shanghai)).not.toBe(fingerprintJob(beijing));
    expect(mergeJob(existing, { ...shanghai, capturedAt: "2026-07-18T10:00:00.000Z" }).id).toBe(existing.id);
  });
});
