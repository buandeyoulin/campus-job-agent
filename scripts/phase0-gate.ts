import type { ProbeResult } from "@campus-job-agent/contracts";

export const REQUIRED_PHASE0_PROBES = new Set([
  "tencent",
  "codex",
  "pdf-output",
  "resume-pdf",
  "resume-docx",
]);

export function failedRequiredProbeNames(results: ProbeResult[]): string[] {
  const statusByName = new Map(results.map((result) => [result.name, result.status]));
  return [...REQUIRED_PHASE0_PROBES].filter((name) => statusByName.get(name) !== "pass");
}
