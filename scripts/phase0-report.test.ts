import { describe, expect, it } from "vitest";
import { formatPhase0Report, shouldUpdateTrackedReport } from "./phase0-report.js";

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

  it("keeps the tracked report stable when only timestamps change", () => {
    const previous = formatPhase0Report([
      { name: "tencent", status: "pass", summary: "jobs returned", details: {}, checkedAt: "2026-07-16T00:00:00.000Z" },
    ]);
    const next = formatPhase0Report([
      { name: "tencent", status: "pass", summary: "jobs returned", details: {}, checkedAt: "2026-07-16T01:00:00.000Z" },
    ]);
    expect(shouldUpdateTrackedReport(previous, next)).toBe(false);
  });

  it("updates the tracked report when a probe outcome changes", () => {
    const previous = formatPhase0Report([
      { name: "tencent", status: "pass", summary: "jobs returned", details: {}, checkedAt: "2026-07-16T00:00:00.000Z" },
    ]);
    const next = formatPhase0Report([
      { name: "tencent", status: "fail", summary: "request failed", details: {}, checkedAt: "2026-07-16T01:00:00.000Z" },
    ]);
    expect(shouldUpdateTrackedReport(previous, next)).toBe(true);
  });
});
