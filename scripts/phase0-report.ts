import type { ProbeResult } from "@campus-job-agent/contracts";

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
    "Tencent, OpenAI-compatible, Ollama, PDF output, PDF parsing, and DOCX parsing are required to pass before Phase 1. OfferBiu is informational: FAIL means its public page is not a supported automatic source and the product must show that limitation explicitly.",
    "",
  ].join("\n");
}
