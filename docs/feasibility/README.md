# Phase 0 Feasibility Probes

Run `npm run phase0` after installing Chromium with `npm exec playwright install chromium`.

Required environment variables for cloud validation:

- `OPENAI_COMPATIBLE_BASE_URL`
- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_MODEL`

Required environment variable for local validation:

- `OLLAMA_MODEL`

Optional Ollama override:

- `OLLAMA_BASE_URL` (defaults to `http://127.0.0.1:11434`)

The command writes full sanitized probe data to `.local/phase0/results.json` and the reviewable summary to `docs/feasibility/phase-0-results.md`. OfferBiu failure is an accepted feasibility result; all other probes are required before Phase 1 planning.
