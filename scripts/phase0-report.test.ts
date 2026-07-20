import { describe, expect, it } from "vitest";
import type { ProbeResult } from "@campus-job-agent/contracts";
import { failedRequiredProbeNames, REQUIRED_PHASE0_PROBES } from "./phase0-gate.js";
import { formatPhase0Report, shouldUpdateTrackedReport } from "./phase0-report.js";

describe("Phase 0 report", () => {
  it("lists probe outcomes without serializing secret-shaped fields", () => {
    const report = formatPhase0Report([
      { name: "codex", status: "pass", summary: "schema returned", details: {}, checkedAt: "2026-07-16T00:00:00.000Z" },
    ]);
    expect(report).toContain("| codex | PASS | schema returned |");
    expect(report).not.toMatch(/api.?key|authorization|secret/i);
  });

  it("describes Codex as required and the other model providers as optional", () => {
    const report = formatPhase0Report([]);
    expect(report).toContain("Codex, PDF output, PDF parsing, and DOCX parsing are required");
    expect(report).toContain("OpenAI-compatible and Ollama are optional");
  });

  it("keeps the tracked report stable when only timestamps change", () => {
    const previous = formatPhase0Report([
      { name: "codex", status: "pass", summary: "schema returned", details: {}, checkedAt: "2026-07-16T00:00:00.000Z" },
    ]);
    const next = formatPhase0Report([
      { name: "codex", status: "pass", summary: "schema returned", details: {}, checkedAt: "2026-07-16T01:00:00.000Z" },
    ]);
    expect(shouldUpdateTrackedReport(previous, next)).toBe(false);
  });

  it("updates the tracked report when a probe outcome changes", () => {
    const previous = formatPhase0Report([
      { name: "codex", status: "pass", summary: "schema returned", details: {}, checkedAt: "2026-07-16T00:00:00.000Z" },
    ]);
    const next = formatPhase0Report([
      { name: "codex", status: "fail", summary: "request failed", details: {}, checkedAt: "2026-07-16T01:00:00.000Z" },
    ]);
    expect(shouldUpdateTrackedReport(previous, next)).toBe(true);
  });
});

describe("Phase 0 required gate", () => {
  const result = (name: string, status: ProbeResult["status"]): ProbeResult => ({
    name,
    status,
    summary: `${name} ${status}`,
    details: {},
    checkedAt: "2026-07-16T00:00:00.000Z",
  });

  it("requires Codex but permits optional provider skips", () => {
    const results = [
      result("codex", "pass"),
      result("openai-compatible", "skip"),
      result("ollama", "skip"),
      result("pdf-output", "pass"),
      result("resume-pdf", "pass"),
      result("resume-docx", "pass"),
    ];
    expect([...REQUIRED_PHASE0_PROBES]).toEqual(["codex", "pdf-output", "resume-pdf", "resume-docx"]);
    expect(failedRequiredProbeNames(results)).toEqual([]);
  });

  it("fails when Codex is skipped", () => {
    const results = [
      result("codex", "skip"),
      result("pdf-output", "pass"),
      result("resume-pdf", "pass"),
      result("resume-docx", "pass"),
    ];
    expect(failedRequiredProbeNames(results)).toEqual(["codex"]);
  });

  it("fails when required probe results are missing", () => {
    expect(failedRequiredProbeNames([])).toEqual(["codex", "pdf-output", "resume-pdf", "resume-docx"]);
  });
});
