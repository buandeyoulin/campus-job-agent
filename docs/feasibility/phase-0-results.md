# Phase 0 Feasibility Results

This report contains sanitized capability results only. It excludes credentials, resumes, prompts, and model response bodies.

| Probe | Status | Summary | Checked At |
|---|---|---|---|
| tencent | PASS | Tencent public API returned jobs | 2026-07-16T11:10:14.285Z |
| codex | PASS | codex returned schema-valid JSON | 2026-07-16T11:10:26.639Z |
| openai-compatible | SKIP | openai-compatible environment configuration is missing | 2026-07-16T11:10:26.639Z |
| ollama | SKIP | ollama environment configuration is missing | 2026-07-16T11:10:26.639Z |
| pdf-output | PASS | Chinese PDF text layer is extractable | 2026-07-16T11:10:27.654Z |
| resume-pdf | PASS | PDF resume parsing completed | 2026-07-16T11:10:27.667Z |
| resume-docx | PASS | DOCX resume parsing completed | 2026-07-16T11:10:27.715Z |

## Interpretation

Tencent, Codex, PDF output, PDF parsing, and DOCX parsing are required before Phase 1. OpenAI-compatible and Ollama are optional and may report SKIP when not configured.
