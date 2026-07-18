# Remove Tencent Jobs Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除腾讯专用公开职位栏目及其运行时链路，让岗位统一来自自建公司库的公开招聘来源。

**Architecture:** 保留通用 `JobsService` 查询、详情和本机导入能力，删除腾讯抓取依赖和专用路由。新增数据库迁移清理历史腾讯来源；有求职进度引用的岗位仅移除来源关联并保留快照。

**Tech Stack:** TypeScript 7、React 19、Fastify 5、SQLite、Vitest、Vite

## Global Constraints

- 所有投递继续由用户手动完成。
- 不改变公司官网同步、AI 匹配、材料准备和求职进度接口。
- 不删除非腾讯岗位或求职历史。
- 先写失败测试并确认失败，再修改生产代码。

---

### Task 1: 建立删除范围回归保护

**Files:**
- Create: `scripts/tencent-runtime-removal.test.ts`

**Interfaces:**
- Consumes: Node `fs/promises` 与仓库根目录
- Produces: 禁止腾讯专用运行时文件、路由和栏目文案重新出现的测试

- [ ] **Step 1: Write the failing test**

创建测试，读取 `apps/web/src/App.tsx`、`apps/server/src/jobs-routes.ts`、`apps/server/src/jobs-service.ts`、`apps/server/src/services.ts`、`packages/sources/src/index.ts` 和 `scripts/run-phase0.mts`，断言不包含 `JobsWorkspace`、`scan/tencent`、`fetchTencent`、`fetchTencentJobs`、`probeTencent`，并断言 `apps/web/src/components/JobsWorkspace.tsx`、`apps/web/src/jobs-api.ts`、`packages/sources/src/tencent.ts` 不存在。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/tencent-runtime-removal.test.ts`

Expected: FAIL，指出当前腾讯运行时文件或字符串仍存在。

### Task 2: 清理历史腾讯来源数据

**Files:**
- Modify: `packages/storage/src/migrations.ts`
- Modify: `packages/storage/test/database.test.ts`

**Interfaces:**
- Consumes: 现有 schema version 8、`applications.job_id` 外键
- Produces: schema version 9 的幂等 SQL 迁移

- [ ] **Step 1: Write migration tests**

在 version 8 临时数据库中插入两个腾讯岗位：一个无 application 引用，一个有 application 引用。升级后断言：

```ts
expect(db.prepare("select id from job_sources where source = 'tencent'").all()).toEqual([]);
expect(db.prepare("select source from source_scans where source = 'tencent'").all()).toEqual([]);
expect(db.prepare("select id from jobs where id = ?").get(untracked.id)).toBeUndefined();
expect(db.prepare("select id from jobs where id = ?").get(tracked.id)).toMatchObject({ id: tracked.id });
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `npx vitest run packages/storage/test/database.test.ts`

Expected: FAIL，因为 version 9 迁移尚不存在。

- [ ] **Step 3: Implement migration 9**

迁移顺序必须为：删除腾讯 `job_sources` 和 `source_scans`；删除没有任何 application 引用且没有剩余来源的岗位；保留被 application 引用的岗位快照。

- [ ] **Step 4: Verify migration tests pass**

Run: `npx vitest run packages/storage/test/database.test.ts`

Expected: PASS。

### Task 3: 删除腾讯专用运行时链路

**Files:**
- Modify: `apps/web/src/App.tsx`
- Delete: `apps/web/src/components/JobsWorkspace.tsx`
- Delete: `apps/web/src/components/JobsWorkspace.test.tsx`
- Delete: `apps/web/src/jobs-api.ts`
- Modify: `apps/server/src/jobs-service.ts`
- Modify: `apps/server/src/jobs-routes.ts`
- Modify: `apps/server/src/services.ts`
- Modify: `apps/server/test/jobs-routes.test.ts`
- Delete: `packages/sources/src/tencent.ts`
- Delete: `packages/sources/test/tencent.test.ts`
- Delete: `packages/sources/test/fixtures/tencent.json`
- Modify: `packages/sources/src/index.ts`

**Interfaces:**
- Consumes: `JobRepository`, `CompanyJobSyncService`
- Produces: `JobsService({ repository, now? })`，保留 `list`、`get`、`importJobs`

- [ ] **Step 1: Update route tests for desired behavior**

构造 `new JobsService({ repository })`；用通用导入创建岗位后验证 `GET /api/jobs`；断言 `POST /api/jobs/scan/tencent` 和 `GET /api/sources` 返回 404；保留公司官网同步路由测试。

- [ ] **Step 2: Run route and removal tests to verify they fail**

Run: `npx vitest run apps/server/test/jobs-routes.test.ts scripts/tencent-runtime-removal.test.ts`

Expected: FAIL，因为旧路由、旧依赖和旧文件仍存在。

- [ ] **Step 3: Remove frontend and backend runtime code**

从 `AppProps`、默认依赖解析和 JSX 中删除 `jobsApi`/`JobsWorkspace`；精简 `JobsServiceDependencies`；删除腾讯扫描路由、异常类型和生产服务导入；删除来源文件及 export。

- [ ] **Step 4: Verify focused tests pass**

Run: `npx vitest run apps/server/test/jobs-routes.test.ts scripts/tencent-runtime-removal.test.ts apps/web/src/App.test.tsx`

Expected: PASS。

### Task 4: 移除过时探针并完成全仓库验收

**Files:**
- Modify: `scripts/run-phase0.mts`
- Modify: `scripts/phase0-gate.ts`
- Modify: `scripts/phase0-report.ts`
- Modify: `scripts/phase0-report.test.ts`
- Modify: `docs/feasibility/README.md`
- Modify: `docs/feasibility/phase-0-results.md`
- Modify: generic tests that use `tencent` only as a fixture source name

**Interfaces:**
- Consumes: remaining Codex/PDF/DOCX Phase 0 probes
- Produces: no Tencent-specific feasibility requirement or runtime reference

- [ ] **Step 1: Update Phase 0 expectations**

将 `REQUIRED_PHASE0_PROBES` 设为 `codex`、`pdf-output`、`resume-pdf`、`resume-docx`；删除腾讯 probe 调用、报告文案和结果行；把通用存储/合同测试中的 fixture source 改为 `legacy-public` 或 `manual`。

- [ ] **Step 2: Run Phase 0 and generic focused tests**

Run: `npx vitest run scripts/phase0-report.test.ts packages/storage/test packages/contracts/test packages/jobs/test`

Expected: PASS。

- [ ] **Step 3: Scan for forbidden runtime references**

Run: `rg -n -i "tencent|腾讯|JobsWorkspace|更新腾讯公开职位|发现校招与实习岗位" apps packages scripts README.md docs/feasibility`

Expected: 无输出。

- [ ] **Step 4: Run complete verification**

Run: `npm run verify`

Expected: typecheck、全部 Vitest 测试和生产构建均退出 0。

- [ ] **Step 5: Browser acceptance**

启动 `npm run dev`，打开 `http://127.0.0.1:4318`，确认旧栏目和腾讯按钮消失，自建公司岗位库与 AI 求职工作台仍存在，浏览器控制台无错误。

- [ ] **Step 6: Commit and push**

```powershell
git add -A
git commit -m "refactor: remove Tencent-specific job workspace"
git push
```
