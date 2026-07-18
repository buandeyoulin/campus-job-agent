import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyRepository, JobRepository, openDatabase, type StorageDatabase } from "../src/index.js";

const roots: string[] = [];
const storages: StorageDatabase[] = [];
const capturedAt = "2026-07-17T10:00:00.000Z";

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-jobs-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  return new JobRepository(storage.db, () => new Date(capturedAt));
}

afterEach(async () => {
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const job = {
  source: "tencent",
  sourceJobId: "123",
  sourceUrl: "https://careers.example.com/jobs/123",
  title: "前端开发实习生",
  company: "示例科技",
  location: "上海",
  description: "参与 Web 应用开发。",
  capturedAt,
};

describe("job repository", () => {
  it("upserts a duplicate source and retains one canonical job", async () => {
    const repository = await setup();
    const first = repository.upsert(job);
    const second = repository.upsert({ ...job, capturedAt: "2026-07-18T10:00:00.000Z" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(repository.list({ keyword: "", city: "", source: "", status: "", page: 1, pageSize: 20 })).toMatchObject({ total: 1 });
    expect(repository.get(first.job.id)?.sources).toHaveLength(1);
  });

  it("filters jobs without turning an existing record expired after a failed scan", async () => {
    const repository = await setup();
    repository.upsert(job);
    repository.upsert({ ...job, sourceJobId: "456", sourceUrl: "https://careers.example.com/jobs/456", title: "后端开发实习生", location: "北京" });
    repository.recordScan({ source: "tencent", succeeded: false, message: "公开接口暂时不可用" });

    expect(repository.list({ keyword: "前端", city: "上海", source: "tencent", status: "active", page: 1, pageSize: 20 }).total).toBe(1);
    expect(repository.getSourceStatuses()).toEqual([expect.objectContaining({ source: "tencent", available: false })]);
  });

  it("requires two complete source absences before closing an official job", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-official-jobs-"));
    roots.push(root);
    const storage = await openDatabase({ dataRoot: root });
    storages.push(storage);
    const companies = new CompanyRepository(storage.db, () => new Date(capturedAt));
    const jobs = new JobRepository(storage.db, () => new Date(capturedAt));
    const company = companies.upsertSeed({ canonicalName: "Official Semi", aliases: [], officialDomain: "official.example", industries: ["chip_design"], regions: ["中国"], verificationEvidence: [{ kind: "official_domain", url: "https://official.example/", detail: "Official" }] }).company;
    const source = companies.upsertCareerSource(company.id, { canonicalUrl: "https://official.example/careers", kind: "html", adapter: "static", verificationEvidence: [] }).source;
    const official = { ...job, source: "official-company", sourceJobId: "req-1", sourceUrl: "https://official.example/jobs/req-1", company: company.canonicalName };

    const first = jobs.upsertOfficialJob(company.id, source.id, official);
    expect(jobs.upsertOfficialJob(company.id, source.id, official).created).toBe(false);
    jobs.completeOfficialSourceScan(source.id, new Set(), "2026-07-19T08:00:00.000Z");
    expect(jobs.get(first.job.id)?.lifecycleStatus).toBe("possibly_expired");
    jobs.completeOfficialSourceScan(source.id, new Set(), "2026-07-20T08:00:00.000Z");
    expect(jobs.get(first.job.id)?.lifecycleStatus).toBe("closed");

    jobs.upsertOfficialJob(company.id, source.id, { ...official, capturedAt: "2026-07-21T08:00:00.000Z" });
    expect(jobs.get(first.job.id)?.lifecycleStatus).toBe("active");
  });
});
