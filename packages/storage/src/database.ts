import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { MIGRATIONS, type Migration } from "./migrations.js";
import { resolveDataPaths, type DataPaths } from "./paths.js";

export interface StorageDatabase {
  db: DatabaseSync;
  paths: DataPaths;
  close(): void;
}

export interface OpenDatabaseOptions {
  dataRoot?: string;
  migrations?: readonly Migration[];
  now?: () => Date;
}

export function withTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("begin immediate");
  try {
    const result = operation();
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<StorageDatabase> {
  const paths = resolveDataPaths(options.dataRoot);
  await Promise.all([
    paths.root,
    paths.originalResumesDir,
    paths.parsedResumesDir,
    paths.generatedDir,
    paths.backupsDir,
  ].map((directory) => mkdir(directory, { recursive: true })));

  const db = new DatabaseSync(paths.database);
  db.exec(`
    pragma foreign_keys = on;
    pragma journal_mode = wal;
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
  `);

  try {
    const now = options.now ?? (() => new Date());
    const applied = new Set(
      (db.prepare("select version from schema_migrations order by version").all() as Array<{ version: number }>)
        .map((row) => row.version),
    );
    const pending = (options.migrations ?? MIGRATIONS).filter((migration) => !applied.has(migration.version));

    if (pending.length > 0 && applied.size > 0) {
      const stamp = now().toISOString().replace(/[:.]/g, "-");
      const target = path.join(paths.backupsDir, `before-migration-${stamp}.sqlite`);
      await backup(db, target);
      if ((await stat(target)).size === 0) {
        throw new Error("Storage backup failed");
      }
    }

    if (pending.length > 0) {
      withTransaction(db, () => {
        const insert = db.prepare("insert into schema_migrations (version, applied_at) values (?, ?)");
        for (const migration of pending) {
          db.exec(migration.sql);
          insert.run(migration.version, now().toISOString());
        }
      });
    }

    return {
      db,
      paths,
      close: () => db.close(),
    };
  } catch {
    db.close();
    throw new Error("Storage migration failed");
  }
}
