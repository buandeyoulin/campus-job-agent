import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS, openDatabase, resolveDataPaths, type Migration } from "../src/index.js";

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
