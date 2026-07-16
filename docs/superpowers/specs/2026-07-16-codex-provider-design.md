# Codex SDK Default Provider Design

**Date:** 2026-07-16

**Status:** Approved in conversation; written review pending

**Parent design:** `docs/superpowers/specs/2026-07-16-campus-job-agent-design.md`

## Context

The Phase 0 implementation currently supports OpenAI-compatible HTTP APIs and local Ollama through a shared `StructuredAiProvider` interface. Both adapters pass unit tests, but the live Phase 0 gate cannot complete on this machine because no cloud credentials or Ollama installation are present.

The user explicitly prefers to use the Codex/ChatGPT account already available on this computer instead of purchasing or configuring another model service. Official Codex documentation supports embedding Codex in a server-side TypeScript application with `@openai/codex-sdk`; the SDK wraps its pinned `@openai/codex` CLI dependency and supports JSON-schema output. Codex authentication can use a saved ChatGPT sign-in instead of an OpenAI Platform API key.

Relevant official references:

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)

## Decision

Codex SDK becomes the default provider for this user's local installation. OpenAI-compatible and Ollama providers remain supported as optional alternatives for other GitHub users and for deployments that cannot reuse a local Codex login.

This does not embed the current chat thread inside the application. The application starts a new, non-interactive Codex thread for each structured generation request and uses the locally authenticated Codex account. Usage is therefore subject to that account's Codex entitlement, credits, rate limits, workspace controls, and data-handling policy.

## Considered Approaches

### 1. Official Codex TypeScript SDK — selected

Add `@openai/codex-sdk@0.144.5` to `packages/ai-providers` and implement a `CodexProvider` behind the existing `StructuredAiProvider` interface.

Advantages:

- Official typed API with structured-output support.
- Uses its pinned `@openai/codex` runtime instead of the WindowsApps executable that returned `Access is denied` from PowerShell.
- Can reuse saved Codex authentication without placing an API key in the project.
- Fits the existing TypeScript modular-monolith architecture.

Trade-offs:

- Codex is designed primarily as a coding agent, so prompts must explicitly prohibit file or shell work and request only the job-search JSON result.
- Requires a valid local Codex/ChatGPT login and consumes that account's Codex allowance.
- Resume and job-description content is sent to OpenAI; this is not an offline path.

### 2. Spawn `codex exec --ephemeral` directly — rejected

This supports non-persistent sessions and saved authentication, but requires manual child-process lifecycle, JSONL parsing, Windows executable discovery, cancellation, and error mapping. It also reproduces the current WindowsApps execution-permission problem unless a separate CLI is installed.

### 3. Keep OpenAI-compatible/Ollama as mandatory — rejected

This is portable but does not satisfy the user's request to use their existing Codex account. The adapters remain available, but no longer block the default local path.

## Architecture

`packages/ai-providers/src/codex.ts` will implement:

```ts
interface CodexProviderOptions {
  workingDirectory: string;
  client?: CodexClient;
}

class CodexProvider implements StructuredAiProvider {
  generate<T>(request: StructuredRequest<T>): Promise<T>;
}
```

The provider will:

1. Convert the request's Zod schema with Zod 4 `toJSONSchema(..., { target: "draft-07" })`.
2. Start a fresh Codex thread with `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, and a dedicated working directory.
3. Combine the system instruction and user prompt into one explicit content-only task.
4. Pass the JSON schema as the SDK `outputSchema` option.
5. Parse the SDK `finalResponse` with the existing `parseStructured` helper so Zod remains the final trust boundary.

Production construction uses:

```ts
new Codex({
  config: {
    history: { persistence: "none" }
  }
})
```

The provider will not resume threads. Disabling history persistence prevents prompts and responses from being added to Codex's local session history. The dedicated working directory will be `.local/codex-runtime`, initialized as an empty Git repository by the Phase 0 runner and ignored by Git. Codex therefore cannot read the application source tree or user-data directory through its working-directory context.

## Data Flow

```text
StructuredRequest<T>
  -> system and prompt combined
  -> Zod schema converted to JSON Schema
  -> new isolated Codex SDK thread
  -> schema-constrained finalResponse
  -> JSON.parse
  -> original Zod schema validation
  -> T
```

No prompt, resume text, job description, raw model response, access token, or authentication metadata may be written to Git, feasibility reports, or application logs.

## Phase 0 Gate Changes

The probe runner will add a `codex` probe and change provider requirements:

- Required: Tencent, Codex, Chinese PDF output, PDF parsing, and DOCX parsing.
- Informational: OfferBiu public-page result.
- Optional: OpenAI-compatible and Ollama; each runs when configured and reports `SKIP` otherwise.

The Codex live probe asks only for `{ "ok": true }` and contains no resume or personal data. It must return schema-valid JSON using saved authentication before Phase 0 is complete.

If the SDK cannot authenticate, the probe returns a sanitized failure. The application then instructs the local user to complete `codex login`; it never reads, copies, or persists authentication files itself.

## Error Handling

- SDK executable or spawn failure: `Codex runtime could not start`.
- Missing/expired authentication: `Codex authentication is unavailable` when distinguishable from SDK output; otherwise a generic structured-generation failure.
- Empty final response: `Codex response contained no final content`.
- Invalid JSON: existing `AI provider returned invalid JSON` error.
- Schema mismatch: Zod validation error, with no raw response copied into the message.

Errors and reports must not include prompt bodies, resume content, response bodies, tokens, environment values, or filesystem paths outside the project.

## Testing Strategy

### Unit tests

- A fake Codex client records thread options and returns schema-valid JSON.
- The provider uses read-only/no-approval/no-network thread options.
- The provider supplies JSON Schema and revalidates the response with Zod.
- Invalid JSON and schema-invalid output are rejected without echoing raw content.
- Existing OpenAI-compatible and Ollama tests continue to pass.

### Live probe

- Install the pinned SDK dependency.
- Create the ignored empty `.local/codex-runtime` Git directory.
- Run one schema-only request with no personal data.
- Record only PASS/FAIL and a sanitized summary in the Phase 0 report.

### Final verification

`npm ci`, all tests, all workspace typechecks, all builds, and `npm run phase0` must exit successfully. Running the live gate repeatedly must leave the tracked repository clean.

## Success Criteria

1. The local application can generate schema-valid content through Codex without an OpenAI Platform API key.
2. The live `codex` probe passes using the user's saved Codex/ChatGPT authentication.
3. Codex runs with no workspace writes, approvals, tool network access, or persisted local session history.
4. Existing providers remain functional and optional.
5. Phase 0 completes without requiring cloud-provider environment variables or Ollama.
6. The feasibility report contains no personal content, prompts, responses, credentials, or authentication metadata.
