import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CareerSourceAdapter } from "@campus-job-agent/sources";
import { ApplicationRepository, CompanyRepository, JobRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import { CompanyDirectoryService } from "../src/company-directory-service.js";
import { CompanyJobSyncService } from "../src/company-job-sync-service.js";

const roots: string[] = []; const storages: StorageDatabase[] = [];
afterEach(async () => { storages.splice(0).forEach((storage) => storage.close()); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("owned company workflow acceptance", () => {
  it("keeps 20 seed companies idempotently, syncs an official job, and creates no application", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-owned-workflow-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const now = () => new Date("2026-07-18T10:00:00.000Z");
    const repository = new CompanyRepository(storage.db, now);
    const jobs = new JobRepository(storage.db, now);
    const companies = new CompanyDirectoryService({ repository, now });

    expect(companies.importSeed()).toMatchObject({ fetched: 20, created: 20 });
    expect(companies.importSeed()).toMatchObject({ fetched: 20, created: 0, updated: 20 });
    const listed = companies.list({ status: "active", page: 1, pageSize: 100 });
    expect(listed.total).toBe(20);
    const company = listed.companies.find((item) => repository.listCareerSources(item.id).length > 0)!;
    expect(repository.listCareerSources(company.id).length).toBeGreaterThan(0);

    const adapter: CareerSourceAdapter = {
      id: "acceptance-fixture",
      supports: (source) => source.companyId === company.id,
      fetch: async (source, context) => ({ completeness: "complete", sourceCheckedAt: context.capturedAt, jobs: [{
        source: "official-company", sourceJobId: "fixture-1", sourceUrl: `${source.canonicalUrl}#fixture-1`, title: "数字 IC 验证工程师",
        company: context.company.canonicalName, location: "上海", description: "负责 UVM 验证环境和覆盖率收敛", capturedAt: context.capturedAt,
      }] }),
    };
    const sync = new CompanyJobSyncService({ companies: repository, jobs, adapters: [adapter], now });
    await expect(sync.sync({ companyId: company.id })).resolves.toMatchObject({ sourcesSucceeded: 1, jobsFetched: 1, created: 1 });
    expect(jobs.list({ keyword: "UVM", city: "", source: "official-company", status: "active", page: 1, pageSize: 20 }).total).toBe(1);
    expect(new ApplicationRepository(storage.db).list()).toHaveLength(0);
  });
});
