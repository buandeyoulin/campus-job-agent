# OfferBiu Browser Session Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome session bridge that imports every OfferBiu posting visible to the signed-in browser while keeping all OfferBiu credentials inside Chrome memory.

**Architecture:** A Manifest V3 extension observes the signed-in page's own recruitment GET request and retains its request template only in the page-world closure. It paginates the recruitment API, projects each response through a strict job-field whitelist, and forwards batches through an extension service worker to a token-protected loopback endpoint. The existing JobsService and JobRepository normalize, deduplicate, and persist batches.

**Tech Stack:** Manifest V3 JavaScript, Chrome content scripts and service worker, Fastify 5, Zod 4, node:sqlite, Vitest 4.

## Global Constraints

- Never call `chrome.cookies` or read `document.cookie`, `localStorage`, or `sessionStorage`.
- Never put a Request, request headers, Cookie, Authorization, token, or user profile data into page messages, extension messages, loopback request bodies, SQLite, or logs.
- Bind the API only to `127.0.0.1:4317`; do not add wildcard CORS.
- Keep application submission and OfferBiu “加入投递” actions manual.
- Import only the posting-field whitelist from the approved design specification.
- Use OfferBiu record `id` as the stable source job ID and preserve existing repository deduplication.

---

### Task 1: Bridge contracts and pure extension core

**Files:**
- Modify: `packages/contracts/src/jobs.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/offerbiu-bridge/package.json`
- Create: `apps/offerbiu-bridge/extension/core.js`
- Create: `apps/offerbiu-bridge/test/core.test.ts`
- Create: `apps/offerbiu-bridge/scripts/verify-extension.mjs`

**Interfaces:**
- Produces `OfferBiuBridgeBatchSchema` with `{ syncId, seasonYear, page, totalPages, records }`.
- Produces `OfferBiuBridgeSessionSchema` with `{ token }`.
- Produces `globalThis.OfferBiuBridgeCore.sanitizePosting(value)` and `validateBatch(value)`.

- [ ] **Step 1: Write failing contract and whitelist tests**

```ts
it("accepts one bounded OfferBiu bridge page", () => {
  expect(OfferBiuBridgeBatchSchema.parse({
    syncId: "018a2c8a-51dc-7a81-a240-000000000001",
    seasonYear: 2027,
    page: 0,
    totalPages: 313,
    records: [{
      id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师",
      locations: ["上海"], targetYears: [2027], applyUrl: "https://example.com/jobs/1",
    }],
  }).records).toHaveLength(1);
});

it("drops credential-shaped and unknown fields", () => {
  expect(core.sanitizePosting({
    id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师",
    authorization: "Bearer secret", cookie: "secret", accessToken: "secret", unexpected: "x",
  })).toEqual({ id: "rec-1", companyName: "示例半导体", positionsText: "验证工程师" });
});
```

- [ ] **Step 2: Run tests and verify the feature is absent**

Run: `npx vitest run packages/contracts/test/jobs.test.ts apps/offerbiu-bridge/test/core.test.ts`

Expected: FAIL because the bridge schemas, workspace and core module do not exist.

- [ ] **Step 3: Implement the schemas and pure whitelist core**

The record schema must enumerate only the approved fields, use `.strip()`, cap one batch at 50 records, require zero-based `page`, and require `totalPages > page`. `core.js` must use an explicit `POSTING_FIELDS` array and construct a fresh object rather than copying input objects.

```js
(function install(root) {
  const POSTING_FIELDS = ["id", "companyName", "companyNature", "industry", "recruitType",
    "targetYears", "locations", "positionsText", "deadlineText", "announcementUrl",
    "applyUrl", "examPolicy", "noteText", "sourceUpdatedAt", "seasonYear"];
  function sanitizePosting(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result = {};
    for (const key of POSTING_FIELDS) if (Object.hasOwn(value, key)) result[key] = value[key];
    return result;
  }
  root.OfferBiuBridgeCore = Object.freeze({ POSTING_FIELDS, sanitizePosting, validateBatch });
})(globalThis);
```

- [ ] **Step 4: Add a manifest verifier**

`verify-extension.mjs` must parse the manifest, assert Manifest V3, assert only the two approved host patterns, assert every referenced file exists, and scan all extension JavaScript for `chrome.cookies`, `document.cookie`, `localStorage`, and `sessionStorage`.

- [ ] **Step 5: Run the focused tests and workspace build**

Run: `npx vitest run packages/contracts/test/jobs.test.ts apps/offerbiu-bridge/test/core.test.ts && npm run build -w @campus-job-agent/offerbiu-bridge`

Expected: PASS.

### Task 2: Token-protected loopback bridge receiver

**Files:**
- Create: `apps/server/src/offerbiu-bridge-service.ts`
- Create: `apps/server/src/offerbiu-bridge-routes.ts`
- Create: `apps/server/test/offerbiu-bridge-routes.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/src/origin-guard.ts`
- Modify: `apps/server/src/jobs-service.ts`
- Modify: `packages/contracts/src/onboarding.ts`

**Interfaces:**
- `OfferBiuBridgeService.session(): { token: string }`.
- `OfferBiuBridgeService.import(token: string | undefined, input: unknown): ScanResult`.
- GET `/api/offerbiu-bridge/session` and POST `/api/jobs/import/offerbiu-bridge`.

- [ ] **Step 1: Write failing authorization and replay tests**

```ts
it("rejects a bridge batch without the process token", async () => {
  const response = await app.inject({ method: "POST", url: "/api/jobs/import/offerbiu-bridge", payload: batch });
  expect(response.statusCode).toBe(401);
});

it("imports and safely replays a valid bridge batch", async () => {
  const session = await app.inject({ method: "GET", url: "/api/offerbiu-bridge/session" });
  const token = OfferBiuBridgeSessionSchema.parse(session.json()).token;
  const first = await app.inject({ method: "POST", url: "/api/jobs/import/offerbiu-bridge",
    headers: { "x-campus-job-agent-bridge": token }, payload: batch });
  const replay = await app.inject({ method: "POST", url: "/api/jobs/import/offerbiu-bridge",
    headers: { "x-campus-job-agent-bridge": token }, payload: batch });
  expect(ScanResultSchema.parse(first.json())).toMatchObject({ source: "offerbiu", created: 1 });
  expect(ScanResultSchema.parse(replay.json())).toMatchObject({ source: "offerbiu", created: 0, updated: 1 });
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `npx vitest run apps/server/test/offerbiu-bridge-routes.test.ts`

Expected: FAIL with missing route/service.

- [ ] **Step 3: Implement the in-memory token service**

Generate 32 random bytes with `randomBytes(32).toString("base64url")`. Compare submitted tokens using equal-length buffers and `timingSafeEqual`. Never log or persist the token. Parse batches before mapping each record through `mapOfferBiuPosting`, override the source to `offerbiu`, and reuse `JobsService.persist` through a focused public batch method.

- [ ] **Step 4: Exempt only the bridge POST from Origin guard**

Change `installOriginGuard` to accept `tokenProtectedPaths: ReadonlySet<string>`. Skip origin validation only when `request.routeOptions.url` is in that set; the route-level token check remains mandatory. All existing mutation tests must continue to reject missing and remote origins.

- [ ] **Step 5: Register production services and routes**

Construct one `OfferBiuBridgeService` per server process, register both routes, and include `/api/jobs/import/offerbiu-bridge` in the token-protected path set. Do not add CORS headers.

- [ ] **Step 6: Run focused and regression tests**

Run: `npx vitest run apps/server/test/offerbiu-bridge-routes.test.ts apps/server/test/onboarding-routes.test.ts apps/server/test/jobs-routes.test.ts`

Expected: PASS.

### Task 3: Chrome request-template bridge and progress UI

**Files:**
- Create: `apps/offerbiu-bridge/extension/manifest.json`
- Create: `apps/offerbiu-bridge/extension/page-bridge.js`
- Create: `apps/offerbiu-bridge/extension/content.js`
- Create: `apps/offerbiu-bridge/extension/background.js`
- Create: `apps/offerbiu-bridge/extension/styles.css`
- Create: `apps/offerbiu-bridge/test/security.test.ts`

**Interfaces:**
- Page channel: `campus-job-agent-offerbiu-page` messages `ready`, `batch`, `progress`, `complete`, `error`.
- Content channel: `campus-job-agent-offerbiu-content` messages `start`, `batch-ack`.
- Extension runtime message: `{ type: "import-offerbiu-batch", batch }`.

- [ ] **Step 1: Write failing manifest and static-security tests**

```ts
it("requests only OfferBiu and loopback hosts", async () => {
  expect(manifest.host_permissions).toEqual([
    "https://offerbiu.com/*",
    "http://127.0.0.1:4317/*",
  ]);
});

it.each(["chrome.cookies", "document.cookie", "localStorage", "sessionStorage"])(
  "never references %s", async (forbidden) => expect(allExtensionJavaScript).not.toContain(forbidden),
);
```

- [ ] **Step 2: Run extension tests and verify RED**

Run: `npx vitest run apps/offerbiu-bridge/test/security.test.ts`

Expected: FAIL because manifest and scripts are absent.

- [ ] **Step 3: Implement the page-world capability membrane**

Wrap `window.fetch` at `document_start`. For successful `/api/recruitment/postings` responses with `previewLimited === false`, retain a cloned GET request template only inside the IIFE closure and post a credential-free `ready` event. On `start`, fetch page 0 for 2027 and 2026, follow each returned `totalPages`, sanitize every record, and await a matching `batch-ack` before continuing. Stop on preview mode, 401/403, invalid JSON, navigation, or failed acknowledgement.

- [ ] **Step 4: Implement isolated UI and service-worker transport**

The content script creates one fixed panel with status text, progress and a start button. It validates every batch through `OfferBiuBridgeCore.validateBatch` before sending it to the service worker. The service worker checks `sender.tab.url` is on `https://offerbiu.com/`, obtains the loopback session token, POSTs the batch, and retries once with a new token after HTTP 401.

- [ ] **Step 5: Run extension tests and verifier**

Run: `npx vitest run apps/offerbiu-bridge/test/core.test.ts apps/offerbiu-bridge/test/security.test.ts && npm run build -w @campus-job-agent/offerbiu-bridge`

Expected: PASS with no forbidden API references.

### Task 4: Documentation, full verification and signed-in runtime check

**Files:**
- Create: `docs/offerbiu-browser-bridge.md`
- Modify: `README.md`

**Interfaces:**
- Documents loading `apps/offerbiu-bridge/extension` as an unpacked extension and starting `npm run dev`.

- [ ] **Step 1: Document installation and security boundaries**

Document: start Campus Job Agent, open `chrome://extensions`, enable developer mode, load the extension directory, open the signed-in OfferBiu job library, wait for “会话已就绪”, click sync, and verify counts in the local job library. State explicitly that no Cookie/token is copied and applications remain manual.

- [ ] **Step 2: Run complete automated verification**

Run: `npm run verify`

Expected: all workspace typechecks, tests and builds pass.

- [ ] **Step 3: Inspect the final diff and security scan**

Run: `git diff --check && rg -n "chrome\.cookies|document\.cookie|localStorage|sessionStorage" apps/offerbiu-bridge/extension`

Expected: `git diff --check` succeeds and `rg` returns no matches.

- [ ] **Step 4: Perform the only manual browser step**

Load the unpacked extension in Chrome, refresh the already signed-in OfferBiu companies page, start sync, and compare extension completion totals with OfferBiu cohort totals and local `source=offerbiu` count. Do not claim complete until this signed-in run succeeds or report the precise runtime blocker.

- [ ] **Step 5: Commit and push**

Commit the bridge receiver, extension, tests and documentation with `feat: add OfferBiu browser session bridge`, then push `codex/phase-0-and-1` and update the existing draft PR.
