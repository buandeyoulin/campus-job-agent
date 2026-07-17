import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationRepository, JobRepository, openDatabase, type StorageDatabase } from "../src/index.js";

const roots: string[] = []; const storages: StorageDatabase[] = [];
afterEach(async () => { storages.splice(0).forEach((item) => item.close()); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("application repository", () => {
  it("creates one manual application per job and preserves status history", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-applications-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const jobs = new JobRepository(storage.db); const job = jobs.upsert({ source: "manual", sourceJobId: "1", sourceUrl: "https://careers.example.com/1", title: "前端开发实习生", company: "示例科技", location: "上海", description: "公开 JD", capturedAt: "2026-07-17T10:00:00.000Z" }).job;
    const applications = new ApplicationRepository(storage.db, () => new Date("2026-07-17T10:00:00.000Z"));
    const saved = applications.create(job.id);
    const applied = applications.update(saved.id, { status: "applied", note: "已手动投递" });
    expect(applications.create(job.id).id).toBe(saved.id);
    expect(applied).toMatchObject({ status: "applied", note: "已手动投递" });
    expect(applications.events(saved.id)).toHaveLength(2);
  });
});
