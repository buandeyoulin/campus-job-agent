import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationRepository, JobRepository, MIGRATIONS, openDatabase, resolveDataPaths, type Migration } from "../src/index.js";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-storage-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("storage database", () => {
  it("creates the application-data layout and initial schema", async () => {
    const root = await tempRoot();
    const paths = resolveDataPaths(root);
    const storage = await openDatabase({ dataRoot: root });

    expect(storage.paths).toEqual(paths);
    expect(storage.db.prepare("select version from schema_migrations order by version").all())
      .toMatchObject(MIGRATIONS.map((migration) => ({ version: migration.version })));
    expect(storage.db.prepare("select name from sqlite_master where type='table' and name='profile_facts'").get()).toMatchObject({ name: "profile_facts" });
    expect(path.relative(root, storage.paths.database)).not.toMatch(/^\.\.(?:[\\/]|$)/);
    storage.close();
  });

  it("persists committed rows after reopening", async () => {
    const root = await tempRoot();
    const first = await openDatabase({ dataRoot: root });
    first.db.prepare("insert into profile (id, display_name, email, phone, current_city, degree, major, graduation_date, created_at, updated_at) values ('default','虚构用户','','','','','','','2026-07-16T00:00:00.000Z','2026-07-16T00:00:00.000Z')").run();
    first.close();

    const second = await openDatabase({ dataRoot: root });
    expect(second.db.prepare("select display_name from profile where id='default'").get()).toMatchObject({ display_name: "虚构用户" });
    second.close();
  });

  it("creates and verifies a backup before a non-initial migration", async () => {
    const root = await tempRoot();
    const first = await openDatabase({ dataRoot: root });
    first.close();

    const migration3: Migration = { version: MIGRATIONS.at(-1)!.version + 1, sql: "create table migration_probe (value text not null);" };
    const second = await openDatabase({ dataRoot: root, migrations: [...MIGRATIONS, migration3] });
    expect(second.db.prepare("select name from sqlite_master where name='migration_probe'").get()).toMatchObject({ name: "migration_probe" });
    second.close();

    const backups = (await readdir(resolveDataPaths(root).backupsDir)).filter((name) => name.endsWith(".sqlite"));
    expect(backups).toHaveLength(1);
    expect((await stat(path.join(resolveDataPaths(root).backupsDir, backups[0]!))).size).toBeGreaterThan(0);
  });

  it("upgrades a version 7 database without losing existing application history", async () => {
    const root = await tempRoot();
    const previous = await openDatabase({ dataRoot: root, migrations: MIGRATIONS.filter((migration) => migration.version <= 7) });
    const job = new JobRepository(previous.db).upsert({ source: "manual", sourceJobId: "migration", sourceUrl: "https://careers.example.com/migration", title: "验证工程师", company: "示例", location: "", description: "公开 JD", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const application = new ApplicationRepository(previous.db).create(job.id);
    previous.close();

    const upgraded = await openDatabase({ dataRoot: root });
    expect(new ApplicationRepository(upgraded.db).get(application.id)).toMatchObject({ jobId: job.id, status: "saved" });
    expect(new ApplicationRepository(upgraded.db).events(application.id)).toHaveLength(1);
    expect(upgraded.db.prepare("select name from sqlite_master where type='table' and name='application_preparations'").get()).toMatchObject({ name: "application_preparations" });
    upgraded.close();
  });

  it("removes Tencent sources while preserving jobs referenced by application history", async () => {
    const root = await tempRoot();
    const previous = await openDatabase({ dataRoot: root, migrations: MIGRATIONS.filter((migration) => migration.version <= 8) });
    const jobs = new JobRepository(previous.db);
    const untracked = jobs.upsert({ source: "tencent", sourceJobId: "untracked", sourceUrl: "https://careers.example.com/untracked", title: "未跟踪岗位", company: "示例", location: "", description: "历史公开岗位", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const tracked = jobs.upsert({ source: "tencent", sourceJobId: "tracked", sourceUrl: "https://careers.example.com/tracked", title: "已跟踪岗位", company: "示例", location: "", description: "历史公开岗位", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const mixedInput = { source: "official-company", sourceJobId: "official", sourceUrl: "https://official.example.com/mixed", title: "多来源岗位", company: "示例", location: "上海", description: "相同岗位内容", capturedAt: "2026-07-18T10:00:00.000Z" };
    const mixed = jobs.upsert(mixedInput).job;
    jobs.upsert({ ...mixedInput, source: "tencent", sourceJobId: "mixed-legacy", sourceUrl: "https://careers.example.com/mixed" });
    jobs.recordScan({ source: "tencent", succeeded: true, message: "历史来源" });
    new ApplicationRepository(previous.db).create(tracked.id);
    previous.close();

    const upgraded = await openDatabase({ dataRoot: root });
    try {
      expect(upgraded.db.prepare("select job_id from job_sources where source = 'tencent'").all()).toEqual([]);
      expect(upgraded.db.prepare("select source from source_scans where source = 'tencent'").all()).toEqual([]);
      expect(upgraded.db.prepare("select id from jobs where id = ?").get(untracked.id)).toBeUndefined();
      expect(new JobRepository(upgraded.db).get(tracked.id)).toMatchObject({
        id: tracked.id,
        source: "historical",
        status: "expired",
        lifecycleStatus: "closed",
        sources: [expect.objectContaining({ source: "historical" })],
      });
      expect(new JobRepository(upgraded.db).list({ keyword: "", city: "", source: "", status: "active", page: 1, pageSize: 100 }).jobs.map((job) => job.id)).not.toContain(tracked.id);
      expect(upgraded.db.prepare("select id, source from jobs where id = ?").get(mixed.id)).toMatchObject({ id: mixed.id, source: "official-company" });
    } finally {
      upgraded.close();
    }
  });

  it("rolls back a failed migration and returns a sanitized error", async () => {
    const root = await tempRoot();
    const first = await openDatabase({ dataRoot: root });
    first.close();

    const broken: Migration = {
      version: MIGRATIONS.at(-1)!.version + 1,
      sql: "create table rolled_back (value text); insert into missing_table values ('x');",
    };
    await expect(openDatabase({ dataRoot: root, migrations: [...MIGRATIONS, broken] })).rejects.toThrow("Storage migration failed");

    const reopened = await openDatabase({ dataRoot: root });
    expect(reopened.db.prepare("select name from sqlite_master where name='rolled_back'").get()).toBeUndefined();
    reopened.close();
  });
});
