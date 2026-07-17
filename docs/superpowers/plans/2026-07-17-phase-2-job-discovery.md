# Phase 2 Job Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, auditable public-job discovery workflow that imports, normalizes, deduplicates, persists, and displays campus and internship jobs without automating applications.

**Architecture:** Extend the existing modular TypeScript monolith with shared job contracts, a pure `jobs` domain package, migration-backed SQLite repositories, public-source scan orchestration, and a React discovery view. Source adapters return untrusted records; only contracts-validated normalized records reach storage or the UI.

**Tech Stack:** Node.js 24, TypeScript, Zod, Fastify, node:sqlite, React, Vitest, Testing Library.

## Global Constraints

- Use only public data sources and never authenticate to, submit to, or bypass controls on a recruitment website.
- Persist user data only below the configured local application-data root, never in the repository.
- Retain source URLs and capture times, but never persist credentials, cookies, authorization headers, or user resume data in job snapshots.
- A scan failure must not change existing job validity to expired.
- Treat OfferBiu as unavailable unless the existing public-page probe returns usable records.
- Keep all production behavior test-first and use fictional job fixtures.

---

## Planned File Map

```text
packages/contracts/src/jobs.ts                 Job, source, import and API schemas
packages/contracts/test/jobs.test.ts           Contract boundary tests
packages/jobs/src/normalize.ts                 Pure normalization and job fingerprinting
packages/jobs/src/dedupe.ts                    Existing-job merge decision
packages/jobs/src/index.ts                     Public package boundary
packages/jobs/test/normalize.test.ts           Domain tests
packages/jobs/package.json                     New workspace package
packages/storage/src/migrations.ts             SQLite migration v2
packages/storage/src/job-repository.ts         Job and source persistence
packages/storage/test/jobs.test.ts             Repository tests
packages/sources/src/tencent.ts                Paginated public Tencent fetcher
packages/sources/test/tencent.test.ts          Fetcher tests
apps/server/src/jobs-service.ts                Scan, import and query orchestration
apps/server/src/jobs-routes.ts                 Validated HTTP routes
apps/server/src/services.ts                    Production composition
apps/server/src/app.ts                         Route registration
apps/server/test/jobs-routes.test.ts           API tests
apps/web/src/jobs-api.ts                       Browser API boundary
apps/web/src/components/JobsWorkspace.tsx      Discovery filters, list, details
apps/web/src/App.tsx                           Workspace composition
apps/web/src/App.test.tsx                      UI tests
apps/web/src/styles.css                        Discovery presentation
docs/job-discovery.md                          Local source and privacy guide
README.md                                      Phase 2 entry point
```

### Task 1: Define shared job contracts

**Files:**
- Create: `packages/contracts/src/jobs.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/jobs.test.ts`

- [ ] Write tests asserting that a job needs company, title, source URL, capture timestamp and source identifier; an import accepts one or many jobs; list filters reject an invalid page size.
- [ ] Run `npm test -- packages/contracts/test/jobs.test.ts` and confirm RED because `jobs.ts` does not exist.
- [ ] Implement `NormalizedJobSchema`, `StoredJobSchema`, `JobSourceSchema`, `JobListQuerySchema`, `JobImportSchema`, `ScanResultSchema`, `SourceStatusSchema`, and stable API error codes.
- [ ] Re-run the test and confirm GREEN.

### Task 2: Normalize and deduplicate jobs as pure domain code

**Files:**
- Create: `packages/jobs/package.json`
- Create: `packages/jobs/tsconfig.json`
- Create: `packages/jobs/src/normalize.ts`
- Create: `packages/jobs/src/dedupe.ts`
- Create: `packages/jobs/src/index.ts`
- Test: `packages/jobs/test/normalize.test.ts`

- [ ] Write failing tests that normalize whitespace and URL fragments, derive the same fingerprint for title/company/city variants, retain distinct locations, and preserve an existing job ID on a matching fingerprint.
- [ ] Run `npm test -- packages/jobs/test/normalize.test.ts` and confirm RED.
- [ ] Implement pure `normalizeJob`, `fingerprintJob`, and `mergeJob` functions. Use a SHA-256 fingerprint of normalized company, title, location, recruitment type and description; explicit closed deadlines set `expired`, otherwise preserve `active`/`unknown`.
- [ ] Re-run domain tests and confirm GREEN.

### Task 3: Persist jobs and source snapshots

**Files:**
- Modify: `packages/storage/src/migrations.ts`
- Create: `packages/storage/src/job-repository.ts`
- Modify: `packages/storage/src/index.ts`
- Test: `packages/storage/test/jobs.test.ts`

- [ ] Write failing repository tests for upsert idempotence, source-link retention, pagination, keyword/city filtering, and a failed scan that leaves a stored active job unchanged.
- [ ] Run `npm test -- packages/storage/test/jobs.test.ts` and confirm RED.
- [ ] Add migration 2 (`jobs`, `job_sources`, `source_scans`) and implement `JobRepository` methods `upsert`, `list`, `get`, `recordScan`, and `getSourceStatuses` in transactions.
- [ ] Re-run repository tests and confirm GREEN.

### Task 4: Fetch public Tencent jobs and expose safe server APIs

**Files:**
- Modify: `packages/sources/src/tencent.ts`
- Modify: `packages/sources/src/index.ts`
- Test: `packages/sources/test/tencent.test.ts`
- Create: `apps/server/src/jobs-service.ts`
- Create: `apps/server/src/jobs-routes.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/jobs-routes.test.ts`

- [ ] Write failing source tests for one paginated public request, timeouts, and empty responses, then confirm RED.
- [ ] Implement `fetchTencentJobs` with a five-second AbortSignal timeout, sequential page requests, a 100-job hard cap, and no credentials.
- [ ] Write failing Fastify tests that require the local origin for mutations, permit list/detail reads, persist scan results, and reject malformed imports without echoing JD text.
- [ ] Implement `JobsService` and route handlers for scan, import, list, detail and source statuses; use injected fetch and clock functions in tests.
- [ ] Run source and server tests and confirm GREEN.

### Task 5: Add the discovery workspace

**Files:**
- Create: `apps/web/src/jobs-api.ts`
- Create: `apps/web/src/components/JobsWorkspace.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Write failing UI tests for an empty state, a successful Tencent scan, keyword and city filtering, status/error feedback, source-status disclosure, and details containing an ordinary outbound link.
- [ ] Run `npm test -- apps/web/src/App.test.tsx` and confirm RED.
- [ ] Implement a validated `JobsApi`, a semantic discovery section with filters and list/details, and a scan action disabled while busy. Preserve the profile workspace behavior.
- [ ] Re-run the web test and typecheck/build the web workspace; confirm GREEN.

### Task 6: Document and verify

**Files:**
- Create: `docs/job-discovery.md`
- Modify: `README.md`

- [ ] Document supported public sources, the OfferBiu availability rule, manual JSON import shape, local storage location, and the manual-application boundary.
- [ ] Run `npm run verify`, `git diff --check`, and `git status --short`.
- [ ] Commit only verified Phase 2 files with message `feat: add public job discovery`.
