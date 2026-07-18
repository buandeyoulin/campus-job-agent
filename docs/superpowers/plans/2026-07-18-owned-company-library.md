# Owned Company Library and Official Job Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy aggregate source completely and replace it with a local semiconductor company library, optional Brave-based discovery, automatic evidence-based verification, and job synchronization from verified official career sources.

**Architecture:** SQLite owns candidates, verified companies, career sources, sync health, and normalized jobs. A seed importer provides the initial semiconductor company set; a provider interface optionally discovers more companies; a deterministic verifier promotes only evidence-backed candidates. Official-source adapters run behind one orchestrator and can write jobs only for verified companies and career sources.

**Tech Stack:** TypeScript 7, Node.js 24, Fastify 5, React 19, SQLite, Zod 4, Vitest 4, built-in `fetch`, Cheerio 1.2.0 for bounded static HTML parsing.

## Global Constraints

- Final repository scan for the legacy source name and domain must return zero matches, including docs, tests, plans, filenames and Git-tracked fixtures.
- Only public company websites and official ATS tenants may become career sources.
- Search result pages must not be scraped; Brave Search uses its official JSON API only.
- `BRAVE_SEARCH_API_KEY` is optional and must never enter SQLite, API responses, source control or logs.
- A quarantined candidate must never trigger job synchronization.
- One failed or incomplete source scan must never close existing jobs.
- No CAPTCHA, login wall, rate limit or access restriction may be bypassed.
- Job applications, forms and submissions remain manual.
- Existing unrelated user changes and existing Tencent/manual jobs must be preserved.

---

### Task 1: Purge the legacy aggregate source and restore a clean baseline

**Files:**
- Delete: `apps/offerbiu-bridge/`
- Delete: `packages/sources/src/offerbiu.ts`
- Delete: `packages/sources/test/offerbiu.test.ts`
- Delete: `packages/sources/test/offerbiu-jobs.test.ts`
- Delete: `packages/sources/test/offerbiu-directory.test.ts`
- Delete: `apps/server/src/offerbiu-bridge-routes.ts`
- Delete: `apps/server/src/offerbiu-bridge-service.ts`
- Delete: `apps/server/test/offerbiu-bridge-routes.test.ts`
- Delete: `docs/offerbiu-browser-bridge.md`
- Delete: `docs/offerbiu-company-directory.md`
- Delete: `docs/superpowers/specs/2026-07-18-offerbiu-browser-session-bridge-design.md`
- Delete: `docs/superpowers/plans/2026-07-18-offerbiu-browser-session-bridge.md`
- Modify: `packages/contracts/src/jobs.ts`
- Modify: `packages/contracts/test/jobs.test.ts`
- Modify: `packages/contracts/src/onboarding.ts`
- Modify: `packages/sources/src/index.ts`
- Modify: `packages/sources/package.json`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/jobs-service.ts`
- Modify: `apps/server/src/jobs-routes.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/src/origin-guard.ts`
- Modify: `apps/server/test/jobs-routes.test.ts`
- Modify: `apps/web/src/company-directory-api.ts`
- Modify: `apps/web/src/components/CompanyDirectoryWorkspace.tsx`
- Modify: `apps/web/src/components/CompanyDirectoryWorkspace.test.tsx`
- Modify: `apps/server/src/company-directory-service.ts`
- Modify: `apps/server/src/company-directory-routes.ts`
- Modify: `apps/server/test/companies-routes.test.ts`
- Modify: `packages/storage/test/companies.test.ts`
- Modify: `scripts/run-phase0.mts`
- Modify: `scripts/phase0-report.ts`
- Modify: `scripts/phase0-report.test.ts`
- Modify: `README.md`
- Modify: `docs/job-discovery.md`
- Modify: `docs/feasibility/README.md`
- Modify: `docs/feasibility/phase-0-results.md`
- Modify: `docs/superpowers/specs/2026-07-16-campus-job-agent-design.md`
- Modify: `docs/superpowers/specs/2026-07-16-codex-provider-design.md`
- Modify: `docs/superpowers/specs/2026-07-17-phase-2-job-discovery-design.md`
- Modify: `docs/superpowers/plans/2026-07-16-codex-provider.md`
- Modify: `docs/superpowers/plans/2026-07-16-phase-0-technical-validation.md`
- Modify: `docs/superpowers/plans/2026-07-17-phase-2-job-discovery.md`

**Interfaces:**
- Keeps: `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/sources`, `POST /api/jobs/scan/tencent`, `POST /api/jobs/import`.
- Temporarily keeps: generic `GET /api/companies`; Tasks 2-7 replace its contracts and writes.
- Removes: all browser bridge, visible-session import, legacy job scan, and legacy company scan interfaces.

- [ ] **Step 1: Add failing absence-oriented regression assertions**

Remove legacy cases from existing tests, then assert the remaining public API surface explicitly:

```ts
it("rejects an unknown job source route", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/jobs/scan/unknown-source",
    headers: { origin: ORIGIN },
  });
  expect(response.statusCode).toBe(404);
});

it("keeps company listing read-only until the owned library write API is installed", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/companies/scan/unknown-source",
    headers: { origin: ORIGIN },
  });
  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
npx vitest run apps/server/test/jobs-routes.test.ts apps/server/test/companies-routes.test.ts apps/web/src/components/CompanyDirectoryWorkspace.test.tsx
```

Expected: FAIL because the current routes and UI still expose the legacy source operations.

- [ ] **Step 3: Delete source-specific code and reduce services to generic/Tencent behavior**

Make `JobsServiceDependencies` contain only `repository`, `fetchTencent`, and `now`. Remove all legacy schemas and service methods. Restore the origin guard to two arguments:

```ts
export function installOriginGuard(
  app: FastifyInstance,
  allowedOrigins: ReadonlySet<string>,
): void
```

Change `CompanyDirectoryApi` temporarily to:

```ts
export interface CompanyDirectoryApi {
  list(query: CompanyDirectoryListQuery): Promise<CompanyDirectoryList>;
}
```

Remove the scan button and source-specific copy from `CompanyDirectoryWorkspace`; retain listing/search so Task 7 can extend it.

- [ ] **Step 4: Remove every source-specific file and historical reference**

Delete the listed files and edit every listed generic document/script so it describes only Tencent, manual imports, and the forthcoming owned company library. Do not leave a historical paragraph, disabled route, compatibility alias or commented code.

- [ ] **Step 5: Run focused tests and a provisional repository scan**

Run:

```powershell
npx vitest run apps/server/test/jobs-routes.test.ts apps/server/test/companies-routes.test.ts apps/web/src/components/CompanyDirectoryWorkspace.test.tsx packages/contracts/test/jobs.test.ts
rg -n -i "offerbiu|offerbiu\.com" . -g "!node_modules/**" -g "!dist/**" -g "!docs/superpowers/plans/2026-07-18-owned-company-library.md"
```

Expected: tests PASS; scan returns no matches outside this temporary execution plan.

- [ ] **Step 6: Commit the purge**

```powershell
git add -A
git commit -m "refactor: remove legacy aggregate job source"
```

---

### Task 2: Replace the company directory schema with owned candidates, companies and career sources

**Files:**
- Rewrite: `packages/contracts/src/companies.ts`
- Create: `packages/contracts/test/companies.test.ts`
- Modify: `packages/contracts/src/onboarding.ts`
- Modify: `packages/storage/src/migrations.ts`
- Rewrite: `packages/storage/src/company-repository.ts`
- Rewrite: `packages/storage/test/companies.test.ts`
- Modify: `packages/storage/src/index.ts`

**Interfaces:**
- Produces: `CompanyCandidate`, `Company`, `CompanyCareerSource`, paginated list schemas and mutation result schemas.
- Produces repository methods used by later tasks:
  - `upsertCandidate(input): { candidate, created }`
  - `promoteCandidate(id, decision): Company`
  - `upsertSeed(input): { company, created }`
  - `upsertCareerSource(companyId, input): { source, created }`
  - `listCompanies(query)`, `listCandidates(query)`, `listCareerSources(companyId)`
  - `recordSourceSync(id, outcome)`

- [ ] **Step 1: Write failing contract tests**

Add exact schema examples:

```ts
const verifiedCompany = CompanySchema.parse({
  id: "018a2c8a-51dc-7a81-a240-000000000001",
  canonicalName: "Example Semiconductor",
  aliases: ["Example Semi"],
  officialDomain: "example.com",
  industries: ["chip_design"],
  regions: ["中国"],
  origin: "seed",
  status: "active",
  verificationScore: 100,
  verificationEvidence: [{ kind: "official_domain", url: "https://example.com/", detail: "Seed-reviewed official website" }],
  verifiedAt: "2026-07-18T08:00:00.000Z",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
});
expect(verifiedCompany.officialDomain).toBe("example.com");
```

Also test that credentials, arbitrary evidence fields, invalid protocols and non-normalized domains are rejected or stripped.

- [ ] **Step 2: Run contract/storage tests and confirm RED**

```powershell
npx vitest run packages/contracts/test/companies.test.ts packages/storage/test/companies.test.ts
```

Expected: FAIL because the owned-library schemas and repository methods do not exist.

- [ ] **Step 3: Define the owned-library contracts**

Use these exact enums:

```ts
export const CandidateStatusSchema = z.enum(["pending", "quarantined", "verified", "rejected"]);
export const CompanyStatusSchema = z.enum(["active", "paused", "invalid"]);
export const CompanyOriginSchema = z.enum(["seed", "discovery", "manual"]);
export const CareerSourceKindSchema = z.enum(["ats_api", "json_api", "json_ld", "sitemap", "html", "custom"]);
export const CareerSourceStatusSchema = z.enum(["pending", "active", "backoff", "unavailable"]);
export const EvidenceKindSchema = z.enum([
  "official_domain", "identity_match", "homepage_link", "career_semantics",
  "official_ats_link", "redirect_chain", "negative_signal",
]);
```

Domains are lower-case hostname strings without paths. Evidence has `{ kind, url, detail }` and is capped at 20 items. Query schemas support `keyword`, `industry`, `region`, `status`, `page`, and `pageSize`.

- [ ] **Step 4: Add migration version 5**

Within the migration transaction:

1. Drop `company_career_sites` and the old `companies` table because their existing contents came only from the discarded directory.
2. Recreate `companies` with unique `official_domain`, JSON aliases/industries/regions/evidence, origin/status/score and timestamps.
3. Create `company_candidates` with unique candidate domain, evidence JSON, status, score, failure reason and retry fields.
4. Create `company_career_sources` with unique `(company_id, canonical_url)`, adapter/kind/status/health/backoff fields and foreign key cascade. Include `last_success_at`, `last_failure_at`, `last_complete_sync_at`, `next_sync_at`, `backoff_until`, `consecutive_failures`, and `last_error`.
5. Remove non-Tencent/non-manual rows from `source_scans`, `job_sources`, and `jobs`; retain every Tencent/manual job.

Use allow-list SQL without embedding any discarded source identifier. Delete rejected source rows first, preserve every surviving Tencent/manual job, then refresh each job's representative fields from one surviving source:

```sql
delete from job_sources where source not in ('tencent', 'manual');
delete from jobs where not exists (select 1 from job_sources where job_sources.job_id = jobs.id);
update jobs set
  source = (select source from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  source_job_id = (select source_job_id from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  source_url = (select source_url from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  title = (select title from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  company = (select company from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  location = (select location from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  description = (select description from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  posted_at = (select posted_at from job_sources where job_id = jobs.id order by source, source_job_id limit 1),
  last_captured_at = (select captured_at from job_sources where job_id = jobs.id order by source, source_job_id limit 1);
delete from source_scans where source not in ('tencent', 'manual');
```

- [ ] **Step 5: Implement deterministic normalization and repository operations**

Export pure helpers from `company-repository.ts`:

```ts
export function normalizeDomain(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
```

Upsert companies primarily by `official_domain`. Never merge different domains only because display names match. All multi-table writes use `withTransaction`.

- [ ] **Step 6: Verify repository behavior**

Tests must cover:

- repeat seed import does not duplicate;
- same domain plus alias updates one company;
- same name on two domains creates two companies;
- quarantine candidates cannot acquire career sources;
- source sync health increments failures and clears them after success;
- migration preserves Tencent/manual jobs and clears old company-directory rows.

Run:

```powershell
npx vitest run packages/contracts/test/companies.test.ts packages/storage/test/companies.test.ts packages/storage/test/database.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the owned schema**

```powershell
git add packages/contracts packages/storage
git commit -m "feat: add owned company library schema"
```

---

### Task 3: Add the reviewed semiconductor seed library

**Files:**
- Create: `packages/sources/data/semiconductor-companies.json`
- Create: `packages/sources/src/company-seed.ts`
- Create: `packages/sources/test/company-seed.test.ts`
- Modify: `packages/sources/src/index.ts`
- Modify: `apps/server/src/company-directory-service.ts`
- Modify: `apps/server/test/companies-routes.test.ts`

**Interfaces:**
- Produces: `loadSemiconductorCompanySeed(): SeedCompanyInput[]`.
- Produces: `CompanyDirectoryService.importSeed(): CompanyMutationResult`.
- Seed list contains exactly these first 20 company identities, each paired with its verified official domain and official career entry during implementation:
  - 紫光展锐, 寒武纪, 海光信息, 龙芯中科, 兆易创新
  - 澜起科技, 芯原股份, 瑞芯微, 全志科技, 地平线
  - 黑芝麻智能, 长江存储, 长鑫存储, 中芯国际, 华虹半导体
  - 北方华创, 中微公司, 华大九天, 国微思尔芯, 壁仞科技

- [ ] **Step 1: Write a failing seed integrity test**

```ts
it("loads 20 unique reviewed semiconductor companies", () => {
  const seed = loadSemiconductorCompanySeed();
  expect(seed).toHaveLength(20);
  expect(new Set(seed.map((item) => item.officialDomain)).size).toBe(20);
  expect(seed.every((item) => item.industries.length > 0)).toBe(true);
  expect(seed.every((item) => item.careerSources.length > 0)).toBe(true);
});
```

Also assert every URL is HTTPS, every career source shares the official domain or carries explicit `official_ats_link` evidence, and no URL belongs to an aggregate recruitment site.

- [ ] **Step 2: Run the seed test and confirm RED**

```powershell
npx vitest run packages/sources/test/company-seed.test.ts
```

Expected: FAIL because seed files do not exist.

- [ ] **Step 3: Verify the 20 official domains and career entries**

For each named company, open the official homepage and follow only its own recruitment/careers navigation. Record the final HTTPS URL and whether it is same-domain or an ATS tenant directly linked by the homepage. Exclude a company from this exact seed only if the official identity or career entry cannot be verified; replace it with the next reviewed semiconductor company so the file still contains exactly 20 entries.

The JSON shape is exact:

```json
{
  "version": 1,
  "companies": [{
    "canonicalName": "Example Semiconductor",
    "aliases": ["Example Semi"],
    "officialDomain": "example.com",
    "industries": ["chip_design"],
    "regions": ["中国"],
    "verificationEvidence": [{
      "kind": "official_domain",
      "url": "https://example.com/",
      "detail": "Official corporate homepage"
    }],
    "careerSources": [{
      "url": "https://example.com/careers",
      "kind": "html",
      "adapter": "unclassified",
      "evidence": [{
        "kind": "homepage_link",
        "url": "https://example.com/",
        "detail": "Official homepage links to this careers page"
      }]
    }]
  }]
}
```

- [ ] **Step 4: Implement seed parsing and idempotent import**

Parse the entire JSON through `SeedCompanyCollectionSchema`. `importSeed()` upserts the company and all career sources in one company-scoped transaction, reporting `{ fetched: 20, created, updated, completedAt }`.

- [ ] **Step 5: Verify idempotence and provenance**

```powershell
npx vitest run packages/sources/test/company-seed.test.ts apps/server/test/companies-routes.test.ts packages/storage/test/companies.test.ts
```

Expected: first import creates 20 companies; replay creates 0 and updates 20; every company is `active`, origin `seed`, score 100.

- [ ] **Step 6: Commit the seed library**

```powershell
git add packages/sources apps/server/src/company-directory-service.ts apps/server/test/companies-routes.test.ts
git commit -m "feat: seed semiconductor company library"
```

---

### Task 4: Implement automatic candidate verification and quarantine

**Files:**
- Create: `packages/sources/src/company-verifier.ts`
- Create: `packages/sources/src/career-source-classifier.ts`
- Create: `packages/sources/test/company-verifier.test.ts`
- Create: `packages/sources/test/career-source-classifier.test.ts`
- Modify: `packages/sources/src/index.ts`
- Modify: `packages/sources/package.json`
- Modify: `package-lock.json`
- Modify: `apps/server/src/company-directory-service.ts`
- Modify: `apps/server/test/companies-routes.test.ts`

**Interfaces:**
- Produces: `verifyCompanyCandidate(candidate, options): Promise<VerificationDecision>`.
- Produces: `classifyCareerSource(url, html, evidence): CareerSourceClassification`.
- `VerificationDecision` is `{ status, score, canonicalName, officialDomain, evidence, failureReason, careerSources }`.
- Score thresholds: `verified >= 80`, `quarantined 40..79`, `rejected < 40` or any hard negative.

- [ ] **Step 1: Write failing deterministic verifier tests**

Use injected `fetcher` fixtures, never live network in unit tests. Cover:

```ts
expect(await verifyCompanyCandidate(candidate, fixtures.officialSameDomain)).toMatchObject({
  status: "verified",
  score: 100,
  officialDomain: "example.com",
});

expect(await verifyCompanyCandidate(candidate, fixtures.unlinkedAts)).toMatchObject({
  status: "quarantined",
});

expect(await verifyCompanyCandidate(candidate, fixtures.aggregateSite)).toMatchObject({
  status: "rejected",
});
```

- [ ] **Step 2: Run the verifier test and confirm RED**

```powershell
npx vitest run packages/sources/test/company-verifier.test.ts packages/sources/test/career-source-classifier.test.ts
```

Expected: FAIL because verifier and classifier are absent.

- [ ] **Step 3: Install the bounded static HTML parser**

```powershell
npm install cheerio@1.2.0 -w @campus-job-agent/sources --save-exact
```

Expected: `packages/sources/package.json` and `package-lock.json` record exactly `cheerio: 1.2.0`.

- [ ] **Step 4: Implement scoring with explicit evidence**

Use this exact score table:

- `+35`: HTTPS homepage resolves on the proposed official registrable domain.
- `+25`: canonical name or a declared alias matches page title/organization metadata.
- `+20`: career URL is linked by the official homepage or careers navigation.
- `+15`: page contains recruiting semantics in Chinese or English.
- `+5`: redirect chain remains HTTPS and ends on the same official domain.
- `+20`: external ATS tenant is directly linked by the verified official domain.
- hard reject: known aggregate category, credential/login-only page, personal page, invalid TLS/URL, or conflicting company identity.

Cap the score at 100. Fetch at most the homepage and two evidence pages, use `AbortSignal.timeout(10_000)`, follow at most five redirects, limit each text response to 2 MiB, and never execute page JavaScript.

Use Cheerio only on bounded HTML. The classifier returns `json_ld` when valid `JobPosting` data exists, recognizes an external ATS only when `official_ats_link` evidence is present, and otherwise returns `html` with adapter `unclassified`. It never promotes a source merely because its hostname resembles a known ATS.

- [ ] **Step 5: Persist decisions through the service**

`CompanyDirectoryService.verifyPendingCandidates(limit = 20)` processes oldest eligible candidates. Verified candidates are promoted and their validated career sources created; quarantined candidates get exponential retry timestamps; rejected candidates retain evidence and reason.

- [ ] **Step 6: Verify isolation and recovery**

```powershell
npx vitest run packages/sources/test/company-verifier.test.ts packages/sources/test/career-source-classifier.test.ts apps/server/test/companies-routes.test.ts packages/storage/test/companies.test.ts
```

Expected: PASS; tests prove quarantined/rejected candidates cannot own career sources.

- [ ] **Step 7: Commit verification**

```powershell
git add packages/sources packages/storage apps/server
git commit -m "feat: verify and quarantine company candidates"
```

---

### Task 5: Add optional Brave discovery without leaking the API key

**Files:**
- Create: `packages/sources/src/company-discovery.ts`
- Create: `packages/sources/src/brave-company-discovery.ts`
- Create: `packages/sources/test/brave-company-discovery.test.ts`
- Modify: `packages/sources/src/index.ts`
- Modify: `apps/server/src/company-directory-service.ts`
- Modify: `apps/server/src/company-directory-routes.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/test/companies-routes.test.ts`
- Modify: `packages/contracts/src/onboarding.ts`

**Interfaces:**
- Produces:

```ts
export interface CompanyDiscoveryProvider {
  discover(queries: readonly string[]): Promise<CompanyDiscoveryResult[]>;
}

export interface CompanyDiscoveryResult {
  query: string;
  title: string;
  url: string;
  snippet: string;
}
```

- Adds: `POST /api/companies/discover` returning `{ searched, candidatesCreated, candidatesUpdated, verified, quarantined, rejected, completedAt }`.
- Adds API errors: `discovery_not_configured`, `discovery_rate_limited`, `discovery_unavailable`.

- [ ] **Step 1: Write failing provider and route tests**

Tests must prove:

- missing key returns 409 `discovery_not_configured` without invoking fetch;
- provider sends the key only in `X-Subscription-Token`;
- key never appears in thrown errors, response bodies, repository evidence or captured logs;
- 429 uses `X-RateLimit-Reset` to return a typed retry time;
- duplicate result URLs become one candidate;
- discovery automatically invokes verification and reports each outcome.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npx vitest run packages/sources/test/brave-company-discovery.test.ts apps/server/test/companies-routes.test.ts
```

Expected: FAIL because provider and route are absent.

- [ ] **Step 3: Implement the provider**

Use `GET https://api.search.brave.com/res/v1/web/search` with `count=20`, `country=CN`, `search_lang=zh-hans`, and at most one request per second. Generate these bounded query families from configured chip categories and regions:

```ts
[
  '数字芯片 公司 校园招聘 官网',
  'IC验证 公司 校园招聘 官网',
  '半导体设备 公司 招聘 官网',
  'EDA 公司 校园招聘 官网',
  '晶圆制造 公司 校园招聘 官网',
]
```

Do not paginate beyond two pages per query. Parse only title, URL and description fields through Zod.

- [ ] **Step 4: Wire optional production configuration**

Construct the provider only when `environment.BRAVE_SEARCH_API_KEY` is non-empty. Pass the key directly to the provider constructor; never place it in the service object returned to routes.

- [ ] **Step 5: Verify security and behavior**

```powershell
npx vitest run packages/sources/test/brave-company-discovery.test.ts apps/server/test/companies-routes.test.ts
rg -n "BRAVE_SEARCH_API_KEY" apps packages -g "*.ts" -g "*.tsx"
```

Expected: tests PASS; matches are limited to server environment lookup and provider configuration/tests, with no literal key value.

- [ ] **Step 6: Commit discovery**

```powershell
git add packages/sources apps/server packages/contracts
git commit -m "feat: discover semiconductor companies"
```

---

### Task 6: Synchronize jobs from verified official career sources

**Files:**
- Create: `packages/sources/src/career-source-adapter.ts`
- Create: `packages/sources/src/jsonld-job-adapter.ts`
- Create: `packages/sources/src/html-career-job-adapter.ts`
- Create: `packages/sources/src/official-json-job-adapter.ts`
- Create: `packages/sources/test/jsonld-job-adapter.test.ts`
- Create: `packages/sources/test/html-career-job-adapter.test.ts`
- Create: `packages/sources/test/official-json-job-adapter.test.ts`
- Create: `apps/server/src/company-job-sync-service.ts`
- Create: `apps/server/test/company-job-sync-service.test.ts`
- Create: `apps/server/src/company-maintenance-runner.ts`
- Create: `apps/server/test/company-maintenance-runner.test.ts`
- Modify: `packages/contracts/src/jobs.ts`
- Modify: `packages/storage/src/migrations.ts`
- Modify: `packages/storage/src/job-repository.ts`
- Modify: `packages/storage/test/jobs.test.ts`
- Modify: `apps/server/src/jobs-routes.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface CareerSourceAdapter {
  readonly id: string;
  supports(source: CompanyCareerSource): boolean;
  fetch(source: CompanyCareerSource, context: { company: Company; capturedAt: string }): Promise<OfficialJobBatch>;
}

export interface OfficialJobBatch {
  completeness: "complete" | "partial";
  jobs: NormalizedJob[];
  sourceCheckedAt: string;
}
```

- Adds: `POST /api/companies/jobs/sync` with optional `{ companyId }`; no company ID means all eligible active sources.
- Source name for normalized jobs is `official-company`.
- Produces: `CompanyMaintenanceRunner.start()`, `tick()`, and `stop()` for automatic verification retries and due-source synchronization.

- [ ] **Step 1: Write failing adapter and orchestration tests**

Cover:

- JSON-LD handles one object, arrays and `@graph`, accepting only `@type: JobPosting`;
- static HTML sources use checked-in title/link/location/detail selectors and never guess selectors at runtime;
- malformed/unrelated structured data is skipped without importing page text;
- configured official JSON mapping extracts stable ID, URL, title, location, description and dates;
- adapters reject source URLs not attached to an active verified company;
- partial scans never mark missing jobs;
- complete scans need two consecutive successful absences to move `active -> possibly_expired -> closed`;
- one source failure does not stop another source;
- repeated batches update instead of duplicate.
- maintenance ticks never overlap, retry eligible quarantined candidates, and run only due career sources.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npx vitest run packages/sources/test/jsonld-job-adapter.test.ts packages/sources/test/html-career-job-adapter.test.ts packages/sources/test/official-json-job-adapter.test.ts apps/server/test/company-job-sync-service.test.ts apps/server/test/company-maintenance-runner.test.ts packages/storage/test/jobs.test.ts
```

Expected: FAIL because adapters, orchestration and lifecycle fields are absent.

- [ ] **Step 3: Extend job provenance and lifecycle storage**

Migration version 6 adds nullable `company_id` and `career_source_id` to `job_sources`, plus `last_seen_at`, `missing_complete_scans` and lifecycle values `active`, `possibly_expired`, `closed`. Preserve existing `unknown/active/expired` API compatibility by updating contracts and mapping old values during migration.

Add repository methods:

```ts
upsertOfficialJob(companyId: string, careerSourceId: string, job: NormalizedJob): UpsertedJob;
completeOfficialSourceScan(careerSourceId: string, seenSourceJobIds: ReadonlySet<string>, checkedAt: string): void;
```

The completion method is callable only for `completeness: "complete"`.

- [ ] **Step 4: Implement bounded official adapters**

`JsonLdJobAdapter` fetches one verified page, caps it at 2 MiB, extracts `<script type="application/ld+json">` blocks, and maps only schema-valid `JobPosting` objects.

`HtmlCareerJobAdapter` uses Cheerio 1.2.0 and a checked-in per-source selector configuration with `listItem`, `title`, `link`, optional `location`, and optional detail selectors. It resolves links against the verified source URL, rejects off-domain detail links unless the source contains official ATS evidence, caps a listing at 500 jobs, and marks the batch `partial` whenever pagination cannot be proven complete.

`OfficialJsonJobAdapter` accepts a checked-in per-source mapping object with explicit paths; it does not guess arbitrary JSON fields. All requests use a 15-second timeout, at most five redirects, and a descriptive `User-Agent` containing the project repository URL.

- [ ] **Step 5: Implement the sync service and route**

Select only `company.status = active`, source status `pending|active`, and sources whose `backoff_until` is absent or elapsed. Run sequentially by default with maximum configured concurrency 3. Persist each source batch transactionally, record health, and return aggregate counts.

`CompanyMaintenanceRunner` polls every hour with an unref'ed timer. Each tick first calls `verifyPendingCandidates(20)`, then synchronizes career sources whose persisted `next_sync_at` is due. A successful source with active jobs schedules the next run in 24 hours; a successful source with no jobs schedules seven days; failures use exponential backoff capped at seven days. `start()` is idempotent, ticks do not overlap, and `stop()` clears the timer. Production starts it after service creation and stops it in the Fastify `onClose` hook.

- [ ] **Step 6: Verify lifecycle safety**

```powershell
npx vitest run packages/sources/test/jsonld-job-adapter.test.ts packages/sources/test/html-career-job-adapter.test.ts packages/sources/test/official-json-job-adapter.test.ts apps/server/test/company-job-sync-service.test.ts apps/server/test/company-maintenance-runner.test.ts packages/storage/test/jobs.test.ts apps/server/test/jobs-routes.test.ts
```

Expected: PASS; failure/partial-result tests prove jobs are never falsely closed.

- [ ] **Step 7: Commit official job sync**

```powershell
git add packages/sources packages/contracts packages/storage apps/server
git commit -m "feat: sync verified official company jobs"
```

---

### Task 7: Expose the owned company workflow in the local UI

**Files:**
- Rewrite: `apps/web/src/company-directory-api.ts`
- Rewrite: `apps/web/src/components/CompanyDirectoryWorkspace.tsx`
- Rewrite: `apps/web/src/components/CompanyDirectoryWorkspace.test.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/server/src/company-directory-routes.ts`
- Modify: `apps/server/test/companies-routes.test.ts`
- Modify: `README.md`
- Rewrite: `docs/job-discovery.md`
- Create: `docs/owned-company-library.md`

**Interfaces:**
- UI calls:
  - `GET /api/companies`
  - `GET /api/company-candidates`
  - `GET /api/companies/:id/career-sources`
  - `POST /api/companies`
  - `POST /api/companies/:id/career-sources`
  - `POST /api/companies/seed/import`
  - `POST /api/companies/discover`
  - `POST /api/companies/jobs/sync`
- UI never receives the Brave API key or raw fetched HTML.

- [ ] **Step 1: Write failing component and route tests**

Component tests cover:

- tabs for verified companies and quarantine candidates;
- filter controls for keyword, industry, region and status;
- official career link, verification score/evidence, job count and source health;
- seed import success;
- manual company/career-source additions pass through the same verifier and cannot bypass quarantine;
- discovery-not-configured message that leaves other actions enabled;
- job sync progress/result;
- no automatic application or submission control exists.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
npx vitest run apps/web/src/components/CompanyDirectoryWorkspace.test.tsx apps/server/test/companies-routes.test.ts
```

Expected: FAIL because the new API/UI is absent.

- [ ] **Step 3: Register exact Fastify routes**

All mutations remain protected by the existing exact loopback Origin guard. Route handlers parse Zod bodies/queries and return typed errors; they never echo fetched page content or secrets.

- [ ] **Step 4: Implement the compact company workspace**

Use one accessible card with two tabs. Keep actions explicit:

- `导入内置芯片公司`
- `发现新公司`
- `更新官方岗位`

Provide compact forms for `添加公司官网` and `添加招聘入口`. A manual company URL is stored as a candidate and immediately passed through the same verifier; a manual career URL is accepted only when it belongs to an already verified company and passes source verification.

Show status summaries rather than raw logs. Career links use `target="_blank" rel="noreferrer"`. The job-update action does not navigate to or submit applications.

- [ ] **Step 5: Document operation and boundaries**

`docs/owned-company-library.md` documents seed import, optional `BRAVE_SEARCH_API_KEY`, discovery evidence/quarantine, official-source priority, rate-limit behavior, data directory, lifecycle semantics and manual application boundary.

- [ ] **Step 6: Verify UI and API**

```powershell
npx vitest run apps/web/src/components/CompanyDirectoryWorkspace.test.tsx apps/server/test/companies-routes.test.ts apps/server/test/jobs-routes.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit UI/docs**

```powershell
git add apps/web apps/server README.md docs/job-discovery.md docs/owned-company-library.md
git commit -m "feat: add owned company library workspace"
```

---

### Task 8: Final zero-trace cleanup, verification and publication

**Files:**
- Delete after execution: `docs/superpowers/plans/2026-07-18-owned-company-library.md`
- Review: all tracked files

**Interfaces:**
- Produces a repository with no legacy source name/domain in any tracked filename or content.
- Produces a verified local company library and official-source sync workflow.

- [ ] **Step 1: Run full automated verification**

```powershell
npm run verify
git diff --check
```

Expected: all typechecks, tests and builds pass; diff check emits no errors.

- [ ] **Step 2: Verify the initial local workflow in a temporary data directory**

Start the app with an empty temporary `CAMPUS_JOB_AGENT_DATA_DIR`, then:

1. Import the seed twice and confirm company total remains 20.
2. List companies and career sources.
3. Run one fixture-backed or locally deterministic official-source sync.
4. Confirm jobs appear with source `official-company` and ordinary official links.
5. Confirm no application record was created.

- [ ] **Step 3: Remove this temporary plan so the zero-trace rule can include plans**

```powershell
git rm docs/superpowers/plans/2026-07-18-owned-company-library.md
```

- [ ] **Step 4: Run the final repository-wide forbidden-name scan**

Run the case-insensitive scan for the exact discarded product name and domain across filenames and file contents, excluding only `.git`, `node_modules` and build output. Expected result: zero filename matches and zero content matches. Do not persist the forbidden terms in a script, fixture or documentation.

- [ ] **Step 5: Inspect scope and commit the final cleanup**

```powershell
git status --short
git diff --stat 5ec6785
git diff --check
git add -A
git commit -m "chore: finalize owned company job sources"
```

- [ ] **Step 6: Apply verification-before-completion and publish**

Run `npm run verify` again after the final commit. Only after exit code 0, push `codex/phase-0-and-1` and update the existing draft PR. If GitHub TLS/authentication is still unavailable, report the exact external blocker without claiming publication.
