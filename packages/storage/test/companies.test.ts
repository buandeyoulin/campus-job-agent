import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyRepository, MIGRATIONS, openDatabase, type StorageDatabase } from "../src/index.js";

const NOW = "2026-07-18T08:00:00.000Z";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const evidence = [{ kind: "official_domain" as const, url: "https://example.com/", detail: "Reviewed official site" }];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-companies-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  return { storage, repository: new CompanyRepository(storage.db, () => new Date(NOW)) };
}

afterEach(async () => {
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("owned company repository", () => {
  it("upserts seeds by domain, merges aliases, but never merges different domains by name", async () => {
    const { repository } = await setup();
    const seed = { canonicalName: "Example Semiconductor", aliases: ["Example Semi"], officialDomain: "example.com", industries: ["chip_design"], regions: ["中国"], verificationEvidence: evidence };
    expect(repository.upsertSeed(seed).created).toBe(true);
    expect(repository.upsertSeed({ ...seed, aliases: ["Example Semi", "示例半导体"] }).created).toBe(false);
    expect(repository.upsertSeed({ ...seed, officialDomain: "example.cn" }).created).toBe(true);

    const result = repository.listCompanies({ keyword: "Example", industry: "", region: "", status: "active", page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
    expect(result.companies.find((company) => company.officialDomain === "example.com")?.aliases).toContain("示例半导体");
  });

  it("quarantines candidates and prevents them from owning career sources", async () => {
    const { repository } = await setup();
    const { candidate } = repository.upsertCandidate({ canonicalName: "Candidate", candidateDomain: "candidate.example", homepageUrl: "https://candidate.example/", origin: "discovery", evidence });
    expect(candidate.status).toBe("pending");
    const quarantined = repository.quarantineCandidate(candidate.id, "identity mismatch");
    expect(quarantined.status).toBe("quarantined");
    expect(() => repository.upsertCareerSource(candidate.id, { canonicalUrl: "https://candidate.example/jobs", kind: "html", adapter: "generic-html" })).toThrow();
  });

  it("promotes a candidate and tracks source failures and recovery", async () => {
    const { repository } = await setup();
    const { candidate } = repository.upsertCandidate({ canonicalName: "Promoted", candidateDomain: "promoted.example", homepageUrl: "https://promoted.example/", origin: "manual", evidence });
    const company = repository.promoteCandidate(candidate.id, { aliases: [], industries: ["semiconductor"], regions: ["中国"], verificationScore: 90, verificationEvidence: evidence });
    const { source } = repository.upsertCareerSource(company.id, { canonicalUrl: "https://promoted.example/careers", kind: "html", adapter: "generic-html" });

    expect(repository.recordSourceSync(source.id, { succeeded: false, error: "timeout" }).consecutiveFailures).toBe(1);
    const recovered = repository.recordSourceSync(source.id, { succeeded: true, complete: true });
    expect(recovered).toMatchObject({ status: "active", consecutiveFailures: 0, lastError: null, lastCompleteSyncAt: NOW });
  });

  it("migration five retains allowed jobs and drops the old directory tables", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-migration-"));
    roots.push(root);
    const first = await openDatabase({ dataRoot: root, migrations: MIGRATIONS.slice(0, 4) });
    first.db.exec(`
      insert into companies values ('old-company','old','Old','${NOW}','${NOW}');
      insert into company_career_sites values ('old-site','old-company','https://old.example/jobs','legacy','https://old.example/','pending','${NOW}','${NOW}');
      insert into jobs values ('kept','kept-fp','manual','m1','https://manual.example/1','Kept','Manual Co','','desc',null,'active','${NOW}','${NOW}');
      insert into job_sources values ('kept','manual','m1','https://manual.example/1','Kept','Manual Co','','desc',null,'${NOW}');
      insert into jobs values ('tencent-kept','tencent-fp','tencent','t1','https://careers.tencent.example/1','Tencent Kept','Tencent','','desc',null,'active','${NOW}','${NOW}');
      insert into job_sources values ('tencent-kept','tencent','t1','https://careers.tencent.example/1','Tencent Kept','Tencent','','desc',null,'${NOW}');
      insert into jobs values ('removed','removed-fp','discarded-source','x1','https://discarded.example/1','Removed','Discarded Co','','desc',null,'active','${NOW}','${NOW}');
      insert into job_sources values ('removed','discarded-source','x1','https://discarded.example/1','Removed','Discarded Co','','desc',null,'${NOW}');
    `);
    first.close();

    const migrated = await openDatabase({ dataRoot: root });
    storages.push(migrated);
    expect(migrated.db.prepare("select id from jobs order by id").all()).toEqual([{ id: "kept" }, { id: "tencent-kept" }]);
    expect(migrated.db.prepare("select name from sqlite_master where type='table' and name='company_career_sites'").get()).toBeUndefined();
    expect(migrated.db.prepare("select count(*) as total from companies").get()).toEqual({ total: 0 });
  });
});
