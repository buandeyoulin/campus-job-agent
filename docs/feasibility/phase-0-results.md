# Phase 0 Feasibility Results

This report contains sanitized capability results only. It excludes credentials, resumes, prompts, and model response bodies.

| Probe | Status | Summary | Checked At |
|---|---|---|---|
| tencent | PASS | Tencent public API returned jobs | 2026-07-16T10:19:22.244Z |
| offerbiu | FAIL | OfferBiu public page exposes no usable job records | 2026-07-16T10:19:22.452Z |
| openai-compatible | SKIP | openai-compatible environment configuration is missing | 2026-07-16T10:19:23.176Z |
| ollama | SKIP | ollama environment configuration is missing | 2026-07-16T10:19:23.176Z |
| pdf-output | PASS | Chinese PDF text layer is extractable | 2026-07-16T10:19:24.112Z |
| resume-pdf | PASS | PDF resume parsing completed | 2026-07-16T10:19:24.122Z |
| resume-docx | PASS | DOCX resume parsing completed | 2026-07-16T10:19:24.162Z |

## Interpretation

Tencent, OpenAI-compatible, Ollama, PDF output, PDF parsing, and DOCX parsing are required to pass before Phase 1. OfferBiu is informational: FAIL means its public page is not a supported automatic source and the product must show that limitation explicitly.
