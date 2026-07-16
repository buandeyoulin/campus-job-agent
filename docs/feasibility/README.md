# Phase 0 Feasibility Probes

Install dependencies and Chromium:

```powershell
npm ci
npm exec playwright install chromium
```

Codex is the default required AI provider. It uses the locally saved Codex/ChatGPT authentication and does not require an OpenAI Platform API key.

Check or establish local authentication:

```powershell
npm exec -- codex login status
npm exec -- codex login
```

The second command is only needed when the status command reports that no valid login exists. It opens the official browser sign-in flow.

Run the gate:

```powershell
npm run phase0
```

The Codex probe uses a dedicated empty Git repository under `.local/phase0/codex-runtime`, read-only sandboxing, disabled sandbox network and built-in web search, no approvals, and disabled local Codex history persistence. The request also instructs Codex not to inspect files or run commands. The probe sends only a schema-connectivity request and contains no resume or personal data. Model requests still leave the machine and are governed by the signed-in ChatGPT/Codex workspace policy.

Optional OpenAI-compatible validation uses:

- `OPENAI_COMPATIBLE_BASE_URL`
- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_MODEL`

Optional Ollama validation uses:

- `OLLAMA_MODEL`
- `OLLAMA_BASE_URL` (optional; defaults to `http://127.0.0.1:11434`)

The command writes full sanitized probe data to `.local/phase0/results.json` and a reviewable summary to `docs/feasibility/phase-0-results.md`. Codex, Tencent, PDF generation, PDF parsing, and DOCX parsing must pass. OfferBiu failure and optional-provider skips do not fail the gate.
