import type { ProbeResult } from "@campus-job-agent/contracts";

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
export function shouldUpdateTrackedReport(previous: string | null, next: string): boolean {
  if (previous === null) return true;
  return previous.replace(ISO_TIMESTAMP, "<checked-at>") !== next.replace(ISO_TIMESTAMP, "<checked-at>");
}

export function formatPhase0Report(results: ProbeResult[]): string {
  const rows = results.map((result) => `| ${result.name} | ${result.status.toUpperCase()} | ${result.summary.replace(/\|/g, "\\|")} | ${result.checkedAt} |`);
  return [
    "# Phase 0 Feasibility Results",
    "",
    "This report contains sanitized capability results only. It excludes credentials, resumes, prompts, and model response bodies.",
    "",
    "| Probe | Status | Summary | Checked At |",
    "|---|---|---|---|",
    ...rows,
    "",
    "## Interpretation",
    "",
    "Tencent, Codex, PDF output, PDF parsing, and DOCX parsing are required before Phase 1. OpenAI-compatible and Ollama are optional and may report SKIP when not configured.",
    "",
  ].join("\n");
}
