import { describe, expect, it } from "vitest";
import { formatPhase0Report } from "./phase0-report.js";

describe("Phase 0 report", () => {
  it("lists probe outcomes without serializing secret-shaped fields", () => {
    const report = formatPhase0Report([
      { name: "tencent", status: "pass", summary: "jobs returned", details: { jobCount: 5 }, checkedAt: "2026-07-16T00:00:00.000Z" },
      { name: "offerbiu", status: "fail", summary: "no public records", details: { publicJobCount: 0 }, checkedAt: "2026-07-16T00:00:00.000Z" }
    ]);
    expect(report).toContain("| tencent | PASS | jobs returned |");
    expect(report).toContain("| offerbiu | FAIL | no public records |");
    expect(report).not.toMatch(/api.?key|authorization|secret/i);
  });
});
