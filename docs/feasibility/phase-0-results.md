# Phase 0 Feasibility Results

This report contains sanitized capability results only. It excludes credentials, resumes, prompts, and model response bodies.

| Probe | Status | Summary | Checked At |
|---|---|---|---|
| tencent | PASS | Tencent public API returned jobs | 2026-07-16T11:04:49.850Z |
| offerbiu | FAIL | OfferBiu public page exposes no usable job records | 2026-07-16T11:04:50.060Z |
| codex | PASS | codex returned schema-valid JSON | 2026-07-16T11:04:59.798Z |
| openai-compatible | SKIP | openai-compatible environment configuration is missing | 2026-07-16T11:04:59.798Z |
| ollama | SKIP | ollama environment configuration is missing | 2026-07-16T11:04:59.798Z |
| pdf-output | PASS | Chinese PDF text layer is extractable | 2026-07-16T11:05:00.770Z |
| resume-pdf | PASS | PDF resume parsing completed | 2026-07-16T11:05:00.781Z |
| resume-docx | PASS | DOCX resume parsing completed | 2026-07-16T11:05:00.826Z |

## Interpretation

Tencent, Codex, PDF output, PDF parsing, and DOCX parsing are required before Phase 1. OpenAI-compatible and Ollama are optional and may report SKIP when not configured. OfferBiu is informational: FAIL means its public page is not a supported automatic source and the product must show that limitation explicitly.
