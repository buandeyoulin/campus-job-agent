# Phase 0 Technical Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the smallest local TypeScript workspace that proves the project's high-risk assumptions: local-only startup, public job discovery, Chinese resume parsing, OpenAI-compatible and Ollama structured output, and Chinese PDF generation.

**Architecture:** Use an npm-workspaces modular monolith with a React/Vite web shell, a Fastify server bound to `127.0.0.1`, and focused packages for contracts, sources, profile parsing, AI providers, and materials. Phase 0 produces executable probes and a sanitized feasibility report; it does not build the full job-search product.

**Tech Stack:** Node.js 24.15.0+, npm 11.12.1+, TypeScript 7.0.2, React 19.2.7, Vite 8.1.5, Fastify 5.10.0, Vitest 4.1.10, Zod 4.4.3, Playwright 1.61.1, unpdf 1.6.2, Mammoth 1.12.0, docx 9.7.1.

## Global Constraints

- The server must bind to `127.0.0.1`; never bind to `0.0.0.0` in the default launcher.
- Use only public, no-login recruitment data. Do not bypass authentication, CAPTCHAs, access controls, or anti-bot protections.
- OfferBiu is an informational feasibility probe until public job records are proven accessible; zero public records must be reported as unsupported, not success.
- Tencent Careers public JSON API is the required reliable automatic source for Phase 0.
- Real resumes, API keys, model request bodies, and application records must never enter Git, fixtures, logs, or generated reports.
- OpenAI-compatible and Ollama adapters must share one structured-generation interface and validate every response with Zod.
- AI API keys must be read from environment variables during Phase 0 and must never be persisted.
- Every code task follows red-green-refactor TDD and ends with an independently reviewable commit.
- User-facing and fixture text may be Chinese; source identifiers, TypeScript names, and commit messages use English.
- Generated probe artifacts under `.local/` are ignored. Only the sanitized Markdown feasibility report is committed.

## Design-to-Plan Acceptance Mapping

| Approved Phase 0 requirement | Implemented and verified by |
|---|---|
| OfferBiu public-page feasibility | Task 3 public, no-login page probe and honest supported/unsupported classification |
| Tencent public JSON API | Task 3 normalized fixture parser plus injected-fetch and live-source probe |
| Chinese PDF and DOCX resume parsing | Task 4 real DOCX extraction plus PDF extractor routing and normalization tests |
| OpenAI-Compatible and Ollama structured output | Task 5 shared provider contract, Zod validation, unit tests, and opt-in live probes |
| Chinese HTML-to-PDF and text extraction | Task 6 Playwright generation, one-page check, and extracted Chinese text assertion |
| Sanitized feasibility report | Task 7 orchestration, secret-shaped-field checks, generated Markdown, and final gate |
| Manual application boundary | All tasks exclude login, form submission, HR messaging, and automatic application behavior |

---

## Scope Decomposition

The approved design contains several independent subsystems. This plan covers only Phase 0 technical validation. Follow-on plans are created after this plan passes:

1. Phase 1 onboarding, fact bank, preferences, imports, matching, shortlist, and tracker.
2. Phase 2 tailored resume, PDF/DOCX export, ATS checks, interview preparation, and debriefs.
3. Phase 3 source-adapter expansion and scheduled scans.
4. Phase 4 packaging, backup/restore, extension documentation, and open-source release hardening.

Phase 0 must not add production user tables, complete dashboard pages, automatic application behavior, browser login automation, or HR messaging.

## Planned File Map

```text
package.json                                  Root workspaces, scripts, pinned dev tools
package-lock.json                             npm-resolved dependency lock
tsconfig.base.json                            Shared strict TypeScript settings
vitest.config.ts                              Cross-workspace test discovery
.gitignore                                    Build, secret, local probe, and user-data exclusions
scripts/dev.mjs                               One-command local web/server launcher
scripts/phase0-report.ts                      Pure Markdown feasibility report formatter
scripts/run-phase0.mts                        Live Phase 0 probe orchestrator
scripts/phase0-report.test.ts                 Report redaction and pass/fail tests
apps/server/package.json                      Fastify workspace metadata
apps/server/tsconfig.json                     Server compiler settings
apps/server/src/app.ts                        Injectable Fastify app factory
apps/server/src/index.ts                      Local-only process entrypoint
apps/server/test/app.test.ts                  Health and bind-host behavior tests
apps/web/package.json                         React/Vite workspace metadata
apps/web/tsconfig.json                        Browser compiler settings
apps/web/vite.config.ts                       Dev server and local API proxy
apps/web/index.html                           Vite HTML entry
apps/web/src/main.tsx                         React bootstrap
apps/web/src/App.tsx                          Phase 0 status shell
apps/web/src/App.test.tsx                     Web-shell smoke test
packages/contracts/package.json               Shared runtime contracts workspace
packages/contracts/tsconfig.json              Contracts compiler settings
packages/contracts/src/index.ts               Contract exports
packages/contracts/src/phase0.ts              Probe and normalized-job schemas
packages/contracts/test/phase0.test.ts         Runtime schema tests
packages/sources/package.json                 Public source probe workspace
packages/sources/tsconfig.json                 Source compiler settings
packages/sources/src/index.ts                  Source exports
packages/sources/src/tencent.ts                Tencent API parser and live probe
packages/sources/src/offerbiu.ts               OfferBiu public-page feasibility probe
packages/sources/test/tencent.test.ts          Tencent fixture and error tests
packages/sources/test/offerbiu.test.ts          OfferBiu metric-classification tests
packages/sources/test/fixtures/tencent.json    Synthetic Tencent-shaped response
packages/profile/package.json                 Resume parsing workspace
packages/profile/tsconfig.json                 Profile compiler settings
packages/profile/src/index.ts                  Profile exports
packages/profile/src/parse-resume.ts           PDF/DOCX routing and text normalization
packages/profile/test/parse-resume.test.ts     Chinese parsing and unsupported-type tests
packages/ai-providers/package.json             AI adapter workspace
packages/ai-providers/tsconfig.json            AI compiler settings
packages/ai-providers/src/index.ts             Provider exports
packages/ai-providers/src/types.ts             Structured provider interface
packages/ai-providers/src/openai-compatible.ts OpenAI-compatible adapter
packages/ai-providers/src/ollama.ts             Ollama adapter
packages/ai-providers/test/providers.test.ts    Response validation and secret-safe errors
packages/materials/package.json                PDF proof workspace
packages/materials/tsconfig.json                Materials compiler settings
packages/materials/src/index.ts                 Materials exports
packages/materials/src/render-pdf.ts            Playwright HTML-to-PDF and extraction
packages/materials/test/render-pdf.test.ts       Chinese PDF text-layer integration test
docs/feasibility/README.md                      Probe execution and interpretation guide
docs/feasibility/phase-0-results.md             Sanitized generated feasibility result
```

### Task 1: Bootstrap the Local-Only TypeScript Workspace

**Files:**
- Create: `package.json`
- Create: `package-lock.json` via `npm install`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `scripts/dev.mjs`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/test/app.test.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `buildApp(): FastifyInstance`, `GET /api/health -> { status: "ok" }`, and `npm run dev` starting the web and API processes together.

- [ ] **Step 1: Create workspace manifests and failing smoke tests**

Create `package.json`:

```json
{
  "name": "campus-job-agent",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=24.15.0", "npm": ">=11.12.1" },
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run typecheck && npm test && npm run build"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    "@vitest/coverage-v8": "4.1.10",
    "docx": "9.7.1",
    "jsdom": "29.1.1",
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "apps/**/*.test.tsx", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
  },
});
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.local/
.env
.env.*
!.env.example
playwright-report/
test-results/
*.log
```

Create `apps/server/package.json`:

```json
{
  "name": "@campus-job-agent/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "fastify": "5.10.0" }
}
```

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create the failing `apps/server/test/app.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, LOCAL_HOST } from "../src/app.js";

describe("local server", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];
  afterEach(async () => Promise.all(apps.map((app) => app.close())));

  it("returns a minimal health response", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("exports the loopback-only default host", () => {
    expect(LOCAL_HOST).toBe("127.0.0.1");
  });
});
```

Create `apps/web/package.json`:

```json
{
  "name": "@campus-job-agent/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 4318",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "react": "19.2.7", "react-dom": "19.2.7" }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

Create the failing `apps/web/src/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Phase 0 web shell", () => {
  it("identifies the local technical-validation build", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "校园求职 Agent" })).toBeInTheDocument();
    expect(screen.getByText("Phase 0 技术验证")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Install dependencies and verify the tests fail**

Run:

```powershell
npm install
npm test -- apps/server/test/app.test.ts apps/web/src/App.test.tsx
```

Expected: FAIL because `apps/server/src/app.ts` and `apps/web/src/App.tsx` do not exist.

- [ ] **Step 3: Implement the minimal local server and React shell**

Create `apps/server/src/app.ts`:

```ts
import Fastify from "fastify";

export const LOCAL_HOST = "127.0.0.1" as const;
export const API_PORT = 4317;

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" as const }));
  return app;
}
```

Create `apps/server/src/index.ts`:

```ts
import { API_PORT, buildApp, LOCAL_HOST } from "./app.js";

const app = buildApp();

try {
  await app.listen({ host: LOCAL_HOST, port: API_PORT });
  console.log(`Campus Job Agent API: http://${LOCAL_HOST}:${API_PORT}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
```

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4318,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
});
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>校园求职 Agent</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

Create `apps/web/src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>校园求职 Agent</h1>
      <p>Phase 0 技术验证</p>
    </main>
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

Create `scripts/dev.mjs`:

```js
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev", "-w", "@campus-job-agent/server"], { stdio: "inherit" }),
  spawn(npm, ["run", "dev", "-w", "@campus-job-agent/web"], { stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
```

- [ ] **Step 4: Run focused and workspace verification**

Run:

```powershell
npm test -- apps/server/test/app.test.ts apps/web/src/App.test.tsx
npm run typecheck
npm run build
```

Expected: 3 tests PASS; all workspace typechecks and Vite/server builds exit 0.

- [ ] **Step 5: Commit the workspace baseline**

```powershell
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore scripts apps
git commit -m "chore: bootstrap local TypeScript workspace"
```

### Task 2: Define Shared Probe and Job Contracts

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/phase0.ts`
- Create: `packages/contracts/test/phase0.test.ts`

**Interfaces:**
- Consumes: Zod 4.4.3.
- Produces: `ProbeResultSchema`, `ProbeResult`, `NormalizedJobSchema`, and `NormalizedJob` used by every later Phase 0 package.

- [ ] **Step 1: Add the contracts workspace and failing schema tests**

Create `packages/contracts/package.json`:

```json
{
  "name": "@campus-job-agent/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "zod": "4.4.3" }
}
```

Create `packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/contracts/test/phase0.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NormalizedJobSchema, ProbeResultSchema } from "../src/phase0.js";

describe("Phase 0 contracts", () => {
  it("rejects a probe result without a sanitized summary", () => {
    expect(() => ProbeResultSchema.parse({ name: "x", status: "pass" })).toThrow();
  });

  it("accepts a normalized public job", () => {
    const job = NormalizedJobSchema.parse({
      source: "tencent",
      sourceJobId: "123",
      sourceUrl: "https://careers.tencent.com/jobdesc.html?postId=123",
      title: "软件开发实习生",
      company: "腾讯",
      location: "深圳",
      description: "参与后端服务开发",
      capturedAt: "2026-07-16T00:00:00.000Z"
    });
    expect(job.source).toBe("tencent");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- packages/contracts/test/phase0.test.ts`

Expected: FAIL because `packages/contracts/src/phase0.ts` does not exist.

- [ ] **Step 3: Implement the runtime schemas and exports**

Create `packages/contracts/src/phase0.ts`:

```ts
import { z } from "zod";

export const ProbeResultSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["pass", "fail", "skip"]),
  summary: z.string().min(1),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  checkedAt: z.iso.datetime(),
});

export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const NormalizedJobSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  sourceUrl: z.url(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().default(""),
  description: z.string().min(1),
  postedAt: z.iso.datetime().optional(),
  capturedAt: z.iso.datetime(),
});

export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;
```

Create `packages/contracts/src/index.ts`:

```ts
export * from "./phase0.js";
```

- [ ] **Step 4: Verify schemas, types, and builds**

Run:

```powershell
npm install
npm test -- packages/contracts/test/phase0.test.ts
npm run typecheck -w @campus-job-agent/contracts
npm run build -w @campus-job-agent/contracts
```

Expected: 2 tests PASS; contract typecheck and build exit 0.

- [ ] **Step 5: Commit the contracts**

```powershell
git add package.json package-lock.json packages/contracts
git commit -m "feat: define phase zero contracts"
```

### Task 3: Prove Public Job Discovery and OfferBiu Classification

**Files:**
- Create: `packages/sources/package.json`
- Create: `packages/sources/tsconfig.json`
- Create: `packages/sources/src/index.ts`
- Create: `packages/sources/src/tencent.ts`
- Create: `packages/sources/src/offerbiu.ts`
- Create: `packages/sources/test/tencent.test.ts`
- Create: `packages/sources/test/offerbiu.test.ts`
- Create: `packages/sources/test/fixtures/tencent.json`

**Interfaces:**
- Consumes: `NormalizedJob`, `NormalizedJobSchema`, and `ProbeResult` from `@campus-job-agent/contracts`.
- Produces: `parseTencentResponse(input, capturedAt)`, `probeTencent(fetchImpl)`, `classifyOfferBiuMetrics(text, checkedAt)`, and `probeOfferBiu()`.

- [ ] **Step 1: Add source fixtures and failing parser/classifier tests**

Create `packages/sources/package.json`:

```json
{
  "name": "@campus-job-agent/sources",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@campus-job-agent/contracts": "0.0.0",
    "playwright": "1.61.1"
  }
}
```

Create `packages/sources/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/sources/test/fixtures/tencent.json`:

```json
{
  "Data": {
    "Count": 1,
    "Posts": [{
      "PostId": "123",
      "RecruitPostName": "软件开发实习生",
      "LocationName": "深圳",
      "BGName": "示例事业群",
      "CategoryName": "技术",
      "Responsibility": "参与后端服务开发",
      "LastUpdateTime": "2026年07月16日",
      "PostURL": "http://careers.tencent.com/jobdesc.html?postId=123"
    }]
  }
}
```

Create `packages/sources/test/tencent.test.ts`:

```ts
import fixture from "./fixtures/tencent.json";
import { describe, expect, it, vi } from "vitest";
import { parseTencentResponse, probeTencent } from "../src/tencent.js";

describe("Tencent public source", () => {
  it("normalizes the public API response and upgrades the URL to HTTPS", () => {
    const jobs = parseTencentResponse(fixture, "2026-07-16T00:00:00.000Z");
    expect(jobs).toEqual([expect.objectContaining({
      source: "tencent",
      sourceJobId: "123",
      sourceUrl: "https://careers.tencent.com/jobdesc.html?postId=123",
      title: "软件开发实习生",
      location: "深圳"
    })]);
  });

  it("returns a failed probe instead of throwing when the API is unavailable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const result = await probeTencent(fetchImpl, () => new Date("2026-07-16T00:00:00.000Z"));
    expect(result.status).toBe("fail");
    expect(result.summary).toBe("Tencent public API request failed");
  });
});
```

Create `packages/sources/test/offerbiu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyOfferBiuMetrics } from "../src/offerbiu.js";

describe("OfferBiu public feasibility", () => {
  it("marks the current zero-record public view unsupported", () => {
    const result = classifyOfferBiuMetrics("已收录公司 0 校招信息 0 可投岗位 0", "2026-07-16T00:00:00.000Z");
    expect(result.status).toBe("fail");
    expect(result.details.publicJobCount).toBe(0);
  });

  it("marks visible public job records supported", () => {
    const result = classifyOfferBiuMetrics("已收录公司 12 校招信息 68 可投岗位 31", "2026-07-16T00:00:00.000Z");
    expect(result.status).toBe("pass");
    expect(result.details.publicJobCount).toBe(68);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- packages/sources/test/tencent.test.ts packages/sources/test/offerbiu.test.ts`

Expected: FAIL because the Tencent parser and OfferBiu classifier do not exist.

- [ ] **Step 3: Implement the Tencent and OfferBiu public probes**

Create `packages/sources/src/tencent.ts`:

```ts
import { NormalizedJobSchema, type NormalizedJob, type ProbeResult } from "@campus-job-agent/contracts";

const API = "https://careers.tencent.com/tencentcareer/api/post/Query";

function parseChineseDate(value: unknown): string | undefined {
  const match = String(value ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (!year || !month || !day) return undefined;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

export function parseTencentResponse(input: unknown, capturedAt: string): NormalizedJob[] {
  const posts = (input as { Data?: { Posts?: unknown[] } })?.Data?.Posts;
  if (!Array.isArray(posts)) return [];
  return posts.flatMap((raw) => {
    const post = raw as Record<string, unknown>;
    if (!post.PostId || !post.RecruitPostName || !post.Responsibility) return [];
    const url = String(post.PostURL || `https://careers.tencent.com/jobdesc.html?postId=${post.PostId}`).replace(/^http:/, "https:");
    return [NormalizedJobSchema.parse({
      source: "tencent",
      sourceJobId: String(post.PostId),
      sourceUrl: url,
      title: String(post.RecruitPostName),
      company: "腾讯",
      location: String(post.LocationName ?? ""),
      description: [post.BGName && `BG: ${post.BGName}`, post.CategoryName && `类别: ${post.CategoryName}`, post.Responsibility].filter(Boolean).join("\n"),
      postedAt: parseChineseDate(post.LastUpdateTime),
      capturedAt,
    })];
  });
}

export async function probeTencent(fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<ProbeResult> {
  const checkedAt = now().toISOString();
  const url = `${API}?timestamp=${now().getTime()}&keyword=实习&pageIndex=1&pageSize=5&language=zh-cn`;
  try {
    const response = await fetchImpl(url, { redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const jobs = parseTencentResponse(await response.json(), checkedAt);
    return { name: "tencent", status: jobs.length > 0 ? "pass" : "fail", summary: jobs.length > 0 ? "Tencent public API returned jobs" : "Tencent public API returned no usable jobs", details: { jobCount: jobs.length }, checkedAt };
  } catch {
    return { name: "tencent", status: "fail", summary: "Tencent public API request failed", details: {}, checkedAt };
  }
}
```

Create `packages/sources/src/offerbiu.ts`:

```ts
import type { ProbeResult } from "@campus-job-agent/contracts";
import { chromium } from "playwright";

function metric(text: string, label: string): number {
  const match = text.replace(/\s+/g, " ").match(new RegExp(`${label}\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

export function classifyOfferBiuMetrics(text: string, checkedAt: string): ProbeResult {
  const companyCount = metric(text, "已收录公司");
  const publicJobCount = metric(text, "校招信息");
  const availableCount = metric(text, "可投岗位");
  const supported = publicJobCount > 0 && availableCount > 0;
  return {
    name: "offerbiu",
    status: supported ? "pass" : "fail",
    summary: supported ? "OfferBiu exposes public job records" : "OfferBiu public page exposes no usable job records",
    details: { companyCount, publicJobCount, availableCount },
    checkedAt,
  };
}

export async function probeOfferBiu(now: () => Date = () => new Date()): Promise<ProbeResult> {
  const checkedAt = now().toISOString();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://offerbiu.com/companies/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    return classifyOfferBiuMetrics(await page.locator("body").innerText(), checkedAt);
  } catch {
    return { name: "offerbiu", status: "fail", summary: "OfferBiu public page could not be inspected", details: {}, checkedAt };
  } finally {
    await browser.close();
  }
}
```

Create `packages/sources/src/index.ts`:

```ts
export * from "./offerbiu.js";
export * from "./tencent.js";
```

- [ ] **Step 4: Verify unit tests and run explicit live probes**

Run:

```powershell
npm install
npm exec playwright install chromium
npm test -- packages/sources/test/tencent.test.ts packages/sources/test/offerbiu.test.ts
@'
import { probeTencent, probeOfferBiu } from "./packages/sources/src/index.ts";
console.log(JSON.stringify(await probeTencent(), null, 2));
console.log(JSON.stringify(await probeOfferBiu(), null, 2));
'@ | npm exec tsx -
```

Expected: 4 tests PASS. Tencent live probe reports `status: "pass"` and a positive `jobCount`. OfferBiu reports either `pass` with positive public counts or `fail` with an explicit public-data reason; both are valid feasibility findings.

- [ ] **Step 5: Commit the public-source probes**

```powershell
git add package.json package-lock.json packages/sources
git commit -m "feat: validate public job sources"
```

### Task 4: Validate Chinese PDF and DOCX Resume Parsing

**Files:**
- Create: `packages/profile/package.json`
- Create: `packages/profile/tsconfig.json`
- Create: `packages/profile/src/index.ts`
- Create: `packages/profile/src/parse-resume.ts`
- Create: `packages/profile/test/parse-resume.test.ts`

**Interfaces:**
- Consumes: `unpdf`, `mammoth`, and byte buffers supplied by upload code in Phase 1.
- Produces: `parseResume(input: ResumeInput, extractors?: ResumeExtractors): Promise<ParsedResume>`.

- [ ] **Step 1: Add the profile workspace and failing parsing tests**

Create `packages/profile/package.json`:

```json
{
  "name": "@campus-job-agent/profile",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "mammoth": "1.12.0", "unpdf": "1.6.2" }
}
```

Create `packages/profile/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/profile/test/parse-resume.test.ts`:

```ts
import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it, vi } from "vitest";
import { parseResume } from "../src/parse-resume.js";

describe("resume parsing", () => {
  it("extracts Chinese text from a real DOCX buffer", async () => {
    const document = new Document({ sections: [{ children: [new Paragraph("张三 软件工程实习生"), new Paragraph("TypeScript 项目经验")] }] });
    const data = await Packer.toBuffer(document);
    const result = await parseResume({ fileName: "resume.docx", data });
    expect(result.kind).toBe("docx");
    expect(result.text).toContain("软件工程实习生");
  });

  it("routes PDF bytes through the PDF extractor and normalizes whitespace", async () => {
    const pdf = vi.fn(async () => ({ text: "张三\u0000\r\n\r\n项目经历", pages: 2 }));
    const result = await parseResume({ fileName: "resume.PDF", data: Buffer.from("pdf") }, { pdf, docx: vi.fn() });
    expect(result).toEqual({ kind: "pdf", text: "张三\n\n项目经历", pages: 2, warnings: [] });
  });

  it("rejects unsupported upload types", async () => {
    await expect(parseResume({ fileName: "resume.txt", data: Buffer.from("x") })).rejects.toThrow("Unsupported resume type: .txt");
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- packages/profile/test/parse-resume.test.ts`

Expected: FAIL because `parseResume` does not exist.

- [ ] **Step 3: Implement PDF/DOCX routing and normalization**

Create `packages/profile/src/parse-resume.ts`:

```ts
import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export interface ResumeInput { fileName: string; data: Buffer }
export interface ParsedResume { kind: "pdf" | "docx"; text: string; pages?: number; warnings: string[] }
export interface ResumeExtractors {
  pdf(data: Buffer): Promise<{ text: string; pages: number }>;
  docx(data: Buffer): Promise<{ text: string; warnings: string[] }>;
}

function normalize(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const defaultExtractors: ResumeExtractors = {
  async pdf(data) {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const result = await extractText(pdf, { mergePages: true });
    return { text: result.text, pages: result.totalPages };
  },
  async docx(data) {
    const result = await mammoth.extractRawText({ buffer: data });
    return { text: result.value, warnings: result.messages.map((message) => message.message) };
  },
};

export async function parseResume(input: ResumeInput, extractors: ResumeExtractors = defaultExtractors): Promise<ParsedResume> {
  const extension = path.extname(input.fileName).toLowerCase();
  if (extension === ".pdf") {
    const result = await extractors.pdf(input.data);
    return { kind: "pdf", text: normalize(result.text), pages: result.pages, warnings: [] };
  }
  if (extension === ".docx") {
    const result = await extractors.docx(input.data);
    return { kind: "docx", text: normalize(result.text), warnings: result.warnings };
  }
  throw new Error(`Unsupported resume type: ${extension || "none"}`);
}
```

Create `packages/profile/src/index.ts`:

```ts
export * from "./parse-resume.js";
```

- [ ] **Step 4: Verify parsing, types, and builds**

Run:

```powershell
npm install
npm test -- packages/profile/test/parse-resume.test.ts
npm run typecheck -w @campus-job-agent/profile
npm run build -w @campus-job-agent/profile
```

Expected: 3 tests PASS; profile typecheck and build exit 0.

- [ ] **Step 5: Commit the resume parser proof**

```powershell
git add package.json package-lock.json packages/profile
git commit -m "feat: validate Chinese resume parsing"
```

### Task 5: Validate OpenAI-Compatible and Ollama Structured Output

**Files:**
- Create: `packages/ai-providers/package.json`
- Create: `packages/ai-providers/tsconfig.json`
- Create: `packages/ai-providers/src/index.ts`
- Create: `packages/ai-providers/src/types.ts`
- Create: `packages/ai-providers/src/openai-compatible.ts`
- Create: `packages/ai-providers/src/ollama.ts`
- Create: `packages/ai-providers/test/providers.test.ts`

**Interfaces:**
- Consumes: Zod schemas and an injected `fetch` implementation.
- Produces: `StructuredAiProvider.generate<T>(request): Promise<T>`, `OpenAiCompatibleProvider`, and `OllamaProvider`.

- [ ] **Step 1: Add the AI workspace and failing shared-contract tests**

Create `packages/ai-providers/package.json`:

```json
{
  "name": "@campus-job-agent/ai-providers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "zod": "4.4.3" }
}
```

Create `packages/ai-providers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/ai-providers/test/providers.test.ts`:

```ts
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider, OllamaProvider } from "../src/index.js";

const schema = z.object({ ok: z.literal(true), label: z.string() });

describe("structured AI providers", () => {
  it("validates OpenAI-compatible JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true,\"label\":\"cloud\"}" } }] }), { status: 200 })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider({ baseUrl: "https://api.example.com/v1", apiKey: "secret-value", model: "test", fetchImpl });
    await expect(provider.generate({ system: "Return JSON", prompt: "ping", schema })).resolves.toEqual({ ok: true, label: "cloud" });
  });

  it("validates Ollama JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: { content: "{\"ok\":true,\"label\":\"local\"}" } }), { status: 200 })) as unknown as typeof fetch;
    const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", model: "test", fetchImpl });
    await expect(provider.generate({ system: "Return JSON", prompt: "ping", schema })).resolves.toEqual({ ok: true, label: "local" });
  });

  it("never includes the API key in HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 401 })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider({ baseUrl: "https://api.example.com/v1", apiKey: "secret-value", model: "test", fetchImpl });
    await expect(provider.generate({ system: "x", prompt: "y", schema })).rejects.not.toThrow(/secret-value/);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- packages/ai-providers/test/providers.test.ts`

Expected: FAIL because both provider classes are missing.

- [ ] **Step 3: Implement the shared interface and both adapters**

Create `packages/ai-providers/src/types.ts`:

```ts
import type { z } from "zod";

export interface StructuredRequest<T> { system: string; prompt: string; schema: z.ZodType<T> }
export interface StructuredAiProvider { generate<T>(request: StructuredRequest<T>): Promise<T> }

export function parseStructured<T>(content: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try { json = JSON.parse(content); }
  catch { throw new Error("AI provider returned invalid JSON"); }
  return schema.parse(json);
}
```

Create `packages/ai-providers/src/openai-compatible.ts`:

```ts
import { parseStructured, type StructuredAiProvider, type StructuredRequest } from "./types.js";

export interface OpenAiCompatibleOptions { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch }

export class OpenAiCompatibleProvider implements StructuredAiProvider {
  constructor(private readonly options: OpenAiCompatibleOptions) {}

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI-compatible response contained no message content");
    return parseStructured(content, request.schema);
  }
}
```

Create `packages/ai-providers/src/ollama.ts`:

```ts
import { parseStructured, type StructuredAiProvider, type StructuredRequest } from "./types.js";

export interface OllamaOptions { baseUrl: string; model: string; fetchImpl?: typeof fetch }

export class OllamaProvider implements StructuredAiProvider {
  constructor(private readonly options: OllamaOptions) {}

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, stream: false, format: "json", messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}`);
    const payload = await response.json() as { message?: { content?: string } };
    if (!payload.message?.content) throw new Error("Ollama response contained no message content");
    return parseStructured(payload.message.content, request.schema);
  }
}
```

Create `packages/ai-providers/src/index.ts`:

```ts
export * from "./types.js";
export * from "./openai-compatible.js";
export * from "./ollama.js";
```

- [ ] **Step 4: Verify provider behavior and types**

Run:

```powershell
npm install
npm test -- packages/ai-providers/test/providers.test.ts
npm run typecheck -w @campus-job-agent/ai-providers
npm run build -w @campus-job-agent/ai-providers
```

Expected: 3 tests PASS; provider typecheck and build exit 0.

- [ ] **Step 5: Commit the AI provider proof**

```powershell
git add package.json package-lock.json packages/ai-providers
git commit -m "feat: validate structured AI providers"
```

### Task 6: Validate Chinese HTML-to-PDF and Text Extraction

**Files:**
- Create: `packages/materials/package.json`
- Create: `packages/materials/tsconfig.json`
- Create: `packages/materials/src/index.ts`
- Create: `packages/materials/src/render-pdf.ts`
- Create: `packages/materials/test/render-pdf.test.ts`

**Interfaces:**
- Consumes: HTML strings and output file paths.
- Produces: `renderHtmlToPdf(input): Promise<{ path: string; pages: number; extractedText: string }>`.

- [ ] **Step 1: Add the materials workspace and failing Chinese text-layer test**

Create `packages/materials/package.json`:

```json
{
  "name": "@campus-job-agent/materials",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "playwright": "1.61.1", "unpdf": "1.6.2" }
}
```

Create `packages/materials/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/materials/test/render-pdf.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderHtmlToPdf } from "../src/render-pdf.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe("Chinese PDF proof", () => {
  it("generates a PDF whose text layer contains Chinese resume content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-"));
    dirs.push(dir);
    const result = await renderHtmlToPdf({
      html: "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><style>body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}</style><body><h1>张三</h1><p>软件工程实习生</p><p>TypeScript 项目经验</p></body></html>",
      outputPath: path.join(dir, "resume.pdf")
    });
    expect(result.pages).toBe(1);
    expect(result.extractedText).toContain("软件工程实习生");
  }, 30_000);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm install
npm exec playwright install chromium
npm test -- packages/materials/test/render-pdf.test.ts
```

Expected: FAIL because `renderHtmlToPdf` does not exist.

- [ ] **Step 3: Implement PDF generation and immediate text-layer verification**

Create `packages/materials/src/render-pdf.ts`:

```ts
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";

export interface RenderPdfInput { html: string; outputPath: string }

export async function renderHtmlToPdf(input: RenderPdfInput): Promise<{ path: string; pages: number; extractedText: string }> {
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(input.html, { waitUntil: "networkidle" });
    await page.pdf({ path: input.outputPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
  const bytes = await readFile(input.outputPath);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: true });
  return { path: input.outputPath, pages: extracted.totalPages, extractedText: extracted.text };
}
```

Create `packages/materials/src/index.ts`:

```ts
export * from "./render-pdf.js";
```

- [ ] **Step 4: Verify PDF output, types, and builds**

Run:

```powershell
npm test -- packages/materials/test/render-pdf.test.ts
npm run typecheck -w @campus-job-agent/materials
npm run build -w @campus-job-agent/materials
```

Expected: 1 test PASS; the test verifies one PDF page and an extractable Chinese text layer.

- [ ] **Step 5: Commit the PDF proof**

```powershell
git add package.json package-lock.json packages/materials
git commit -m "feat: validate Chinese PDF generation"
```

### Task 7: Orchestrate Probes and Produce the Sanitized Feasibility Report

**Files:**
- Modify: `package.json`
- Create: `scripts/phase0-report.ts`
- Create: `scripts/phase0-report.test.ts`
- Create: `scripts/run-phase0.mts`
- Create: `docs/feasibility/README.md`
- Create: `docs/feasibility/phase-0-results.md` via the probe runner

**Interfaces:**
- Consumes: every Phase 0 package's public interface.
- Produces: `formatPhase0Report(results)`, `npm run phase0`, `.local/phase0/results.json`, and `docs/feasibility/phase-0-results.md`.

- [ ] **Step 1: Add a failing report-format test**

Create `scripts/phase0-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPhase0Report } from "./phase0-report.js";

describe("Phase 0 report", () => {
  it("lists probe outcomes without serializing secret-shaped fields", () => {
    const report = formatPhase0Report([
      { name: "tencent", status: "pass", summary: "jobs returned", details: { jobCount: 5 }, checkedAt: "2026-07-16T00:00:00.000Z" },
      { name: "offerbiu", status: "fail", summary: "no public records", details: { publicJobCount: 0 }, checkedAt: "2026-07-16T00:00:00.000Z" }
    ]);
    expect(report).toContain("| tencent | PASS | jobs returned |");
    expect(report).toContain("| offerbiu | FAIL | no public records |");
    expect(report).not.toMatch(/api.?key|authorization|secret/i);
  });
});
```

- [ ] **Step 2: Run the report test and verify it fails**

Run: `npm test -- scripts/phase0-report.test.ts`

Expected: FAIL because `formatPhase0Report` does not exist.

- [ ] **Step 3: Implement report formatting and the probe runner**

Create `scripts/phase0-report.ts`:

```ts
import type { ProbeResult } from "@campus-job-agent/contracts";

export function formatPhase0Report(results: ProbeResult[]): string {
  const rows = results.map((result) => `| ${result.name} | ${result.status.toUpperCase()} | ${result.summary.replace(/\|/g, "\\|")} | ${result.checkedAt} |`);
  return [
    "# Phase 0 Feasibility Results",
    "",
    "This report contains sanitized capability results only. It contains no API keys, resumes, prompts, or model response bodies.",
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
```

Create `scripts/run-phase0.mts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph } from "docx";
import { z } from "zod";
import { OpenAiCompatibleProvider, OllamaProvider } from "@campus-job-agent/ai-providers";
import type { ProbeResult } from "@campus-job-agent/contracts";
import { renderHtmlToPdf } from "@campus-job-agent/materials";
import { parseResume } from "@campus-job-agent/profile";
import { probeOfferBiu, probeTencent } from "@campus-job-agent/sources";
import { formatPhase0Report } from "./phase0-report.js";

const localDir = path.resolve(".local/phase0");
const checkedAt = () => new Date().toISOString();
const results: ProbeResult[] = [];
const connectivity = z.object({ ok: z.literal(true) });

results.push(await probeTencent());
results.push(await probeOfferBiu());

async function aiProbe(name: string, provider: { generate<T>(request: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<T> } | null): Promise<ProbeResult> {
  if (!provider) return { name, status: "skip", summary: `${name} environment configuration is missing`, details: {}, checkedAt: checkedAt() };
  try {
    await provider.generate({ system: "Return only valid JSON matching the requested schema.", prompt: "Return {\"ok\":true}.", schema: connectivity });
    return { name, status: "pass", summary: `${name} returned schema-valid JSON`, details: {}, checkedAt: checkedAt() };
  } catch {
    return { name, status: "fail", summary: `${name} structured generation failed`, details: {}, checkedAt: checkedAt() };
  }
}

const openAi = process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_MODEL
  ? new OpenAiCompatibleProvider({ baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL, apiKey: process.env.OPENAI_COMPATIBLE_API_KEY, model: process.env.OPENAI_COMPATIBLE_MODEL }) : null;
const ollama = process.env.OLLAMA_MODEL
  ? new OllamaProvider({ baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434", model: process.env.OLLAMA_MODEL }) : null;
results.push(await aiProbe("openai-compatible", openAi));
results.push(await aiProbe("ollama", ollama));

await mkdir(localDir, { recursive: true });
const pdfPath = path.join(localDir, "chinese-resume.pdf");
try {
  const pdf = await renderHtmlToPdf({ html: "<!doctype html><meta charset='utf-8'><style>body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}</style><h1>张三</h1><p>软件工程实习生</p>", outputPath: pdfPath });
  results.push({ name: "pdf-output", status: pdf.extractedText.includes("软件工程实习生") ? "pass" : "fail", summary: pdf.extractedText.includes("软件工程实习生") ? "Chinese PDF text layer is extractable" : "Chinese PDF lost text-layer content", details: { pages: pdf.pages }, checkedAt: checkedAt() });
  const parsedPdf = await parseResume({ fileName: "resume.pdf", data: await import("node:fs/promises").then((fs) => fs.readFile(pdfPath)) });
  results.push({ name: "resume-pdf", status: parsedPdf.text.includes("软件工程实习生") ? "pass" : "fail", summary: "PDF resume parsing completed", details: { pages: parsedPdf.pages ?? 0 }, checkedAt: checkedAt() });
} catch {
  results.push({ name: "pdf-output", status: "fail", summary: "Chinese PDF generation failed", details: {}, checkedAt: checkedAt() });
  results.push({ name: "resume-pdf", status: "fail", summary: "PDF resume parsing could not run", details: {}, checkedAt: checkedAt() });
}

try {
  const doc = new Document({ sections: [{ children: [new Paragraph("张三 软件工程实习生"), new Paragraph("TypeScript 项目经验")] }] });
  const parsedDocx = await parseResume({ fileName: "resume.docx", data: await Packer.toBuffer(doc) });
  results.push({ name: "resume-docx", status: parsedDocx.text.includes("软件工程实习生") ? "pass" : "fail", summary: "DOCX resume parsing completed", details: {}, checkedAt: checkedAt() });
} catch {
  results.push({ name: "resume-docx", status: "fail", summary: "DOCX resume parsing failed", details: {}, checkedAt: checkedAt() });
}

await writeFile(path.join(localDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
await mkdir(path.resolve("docs/feasibility"), { recursive: true });
await writeFile(path.resolve("docs/feasibility/phase-0-results.md"), formatPhase0Report(results), "utf8");

const required = new Set(["tencent", "openai-compatible", "ollama", "pdf-output", "resume-pdf", "resume-docx"]);
const failedRequired = results.filter((result) => required.has(result.name) && result.status !== "pass");
console.table(results.map(({ name, status, summary }) => ({ name, status, summary })));
if (failedRequired.length > 0) process.exitCode = 1;
```

Add to root `package.json` scripts:

```json
"phase0": "tsx scripts/run-phase0.mts"
```

Create `docs/feasibility/README.md`:

```markdown
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
```

- [ ] **Step 4: Verify redaction, run all tests, then run the live gate**

Run:

```powershell
npm install
npm exec playwright install chromium
npm test -- scripts/phase0-report.test.ts
npm run verify
npm run phase0
```

Expected before model configuration: report test and workspace verification PASS; `npm run phase0` exits 1 and marks missing AI provider configuration as SKIP.

Then configure both providers for the current PowerShell process and rerun:

```powershell
$env:OPENAI_COMPATIBLE_BASE_URL='https://your-provider.example/v1'
$env:OPENAI_COMPATIBLE_API_KEY='your-session-only-key'
$env:OPENAI_COMPATIBLE_MODEL='your-model'
$env:OLLAMA_MODEL='your-installed-model'
npm run phase0
```

Expected after valid configuration: exit 0; Tencent, both AI providers, Chinese PDF output, PDF parsing, and DOCX parsing report PASS. OfferBiu may report PASS or FAIL and never affects the exit code. Verify `docs/feasibility/phase-0-results.md` contains no key, prompt body, resume content, authorization header, or model response body.

- [ ] **Step 5: Commit the runner and sanitized result**

```powershell
git add package.json package-lock.json scripts/phase0-report.ts scripts/phase0-report.test.ts scripts/run-phase0.mts docs/feasibility
git commit -m "test: record phase zero feasibility"
```

## Final Verification Gate

After all seven tasks:

```powershell
npm ci
npm exec playwright install chromium
npm run verify
npm run phase0
git status --short
git log --oneline --max-count=8
```

Expected:

- `npm ci` exits 0.
- `npm run verify` exits 0 with all unit, integration, type, and build checks passing.
- `npm run phase0` exits 0 when both model providers are configured.
- The sanitized report records Tencent and all required technical probes as PASS.
- OfferBiu is recorded honestly as PASS or FAIL based on its public page.
- `git status --short` is empty.
- The log contains one focused commit per task.

Do not start Phase 1 planning until this verification gate passes and the user reviews `docs/feasibility/phase-0-results.md`.
