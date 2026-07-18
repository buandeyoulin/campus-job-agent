import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CareerSourceAdapter } from "@campus-job-agent/sources";
import { CompanyRepository, JobRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import { CompanyJobSyncService } from "../src/company-job-sync-service.js";

const at = "2026-07-18T08:00:00.000Z";
const roots: string[] = [];
const storages: StorageDatabase[] = [];

afterEach(async () => {
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("CompanyJobSyncService", () => {
  it("skips sources without a verified adapter without degrading their health", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-sync-"));
    roots.push(root);
    const storage = await openDatabase({ dataRoot: root });
    storages.push(storage);
    const companies = new CompanyRepository(storage.db, () => new Date(at));
    const jobs = new JobRepository(storage.db, () => new Date(at));
    const company = companies.upsertSeed({ canonicalName: "Unsupported Semi", aliases: [], officialDomain: "unsupported.example", industries: ["chip_design"], regions: ["China"], verificationEvidence: [{ kind: "official_domain", url: "https://unsupported.example/", detail: "Official" }] }).company;
    companies.upsertCareerSource(company.id, { canonicalUrl: "https://unsupported.example/careers", kind: "html", adapter: "not-yet-supported" });
    const service = new CompanyJobSyncService({ companies, jobs, adapters: [], now: () => new Date(at) });
    const before = companies.listCareerSources(company.id)[0];

    await expect(service.sync()).resolves.toMatchObject({ sourcesSelected: 1, sourcesSkipped: 1, sourcesFailed: 0 });
    const after = companies.listCareerSources(company.id)[0];
    expect([after?.consecutiveFailures, after?.status, after?.lastError, after?.lastCheckedAt]).toEqual([
      before?.consecutiveFailures, before?.status, before?.lastError, before?.lastCheckedAt,
    ]);
  });

  it("continues after one source fails, updates repeats, and never expires jobs from partial batches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-sync-"));
    roots.push(root);
    const storage = await openDatabase({ dataRoot: root });
    storages.push(storage);
    const companies = new CompanyRepository(storage.db, () => new Date(at));
    const jobs = new JobRepository(storage.db, () => new Date(at));
    const company = companies.upsertSeed({ canonicalName: "Sync Semi", aliases: [], officialDomain: "sync.example", industries: ["chip_design"], regions: ["中国"], verificationEvidence: [{ kind: "official_domain", url: "https://sync.example/", detail: "Official" }] }).company;
    companies.upsertCareerSource(company.id, { canonicalUrl: "https://sync.example/good", kind: "html", adapter: "good" });
    companies.upsertCareerSource(company.id, { canonicalUrl: "https://sync.example/bad", kind: "html", adapter: "bad" });
    let jobsInBatch = [{ source: "official-company", sourceJobId: "r1", sourceUrl: "https://sync.example/jobs/r1", title: "Verification Engineer", company: company.canonicalName, location: "Shanghai", description: "Build UVM testbenches", capturedAt: at }];
    const good: CareerSourceAdapter = { id: "good", supports: (source) => source.adapter === "good", fetch: async () => ({ completeness: "partial", jobs: jobsInBatch, sourceCheckedAt: at }) };
    const bad: CareerSourceAdapter = { id: "bad", supports: (source) => source.adapter === "bad", fetch: async () => { throw new Error("timeout"); } };
    const service = new CompanyJobSyncService({ companies, jobs, adapters: [bad, good], now: () => new Date(at) });

    await expect(service.sync()).resolves.toMatchObject({ sourcesSelected: 2, sourcesSucceeded: 1, sourcesFailed: 1, created: 1 });
    companies.listCareerSources(company.id).forEach((source) => companies.scheduleCareerSource(source.id, at));
    await expect(service.sync()).resolves.toMatchObject({ updated: 1 });
    jobsInBatch = [];
    companies.listCareerSources(company.id).forEach((source) => companies.scheduleCareerSource(source.id, at));
    await service.sync();
    expect(jobs.list({ keyword: "Verification", city: "", source: "official-company", status: "", page: 1, pageSize: 20 }).jobs[0]?.lifecycleStatus).toBe("active");
  });
});
