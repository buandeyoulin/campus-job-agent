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
    const preparation = applications.savePreparation(saved.id, {
      tailoredResumeMarkdown: "# 定制简历\n\n只包含已确认事实",
      interviewQuestions: [
        { question: "请介绍项目", answerOutline: "按 STAR 展开", evidence: ["项目事实"] },
        { question: "如何验证设计", answerOutline: "说明验证计划", evidence: ["验证技能"] },
        { question: "为何选择岗位", answerOutline: "连接岗位要求", evidence: [] },
      ],
      gaps: ["尚未确认形式验证经历"],
    });
    expect(applications.getPreparation(saved.id)).toEqual(preparation);
    expect(applications.list()).toEqual([applied]);
  });

  it("rolls back the current status when history insertion fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-applications-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const jobs = new JobRepository(storage.db); const job = jobs.upsert({ source: "manual", sourceJobId: "rollback", sourceUrl: "https://careers.example.com/rollback", title: "验证工程师", company: "示例", location: "", description: "公开 JD", capturedAt: "2026-07-17T10:00:00.000Z" }).job;
    const applications = new ApplicationRepository(storage.db, () => new Date("2026-07-17T10:00:00.000Z"));
    const saved = applications.create(job.id);
    storage.db.exec("create trigger reject_applied_event before insert on application_events when new.status = 'applied' begin select raise(abort, 'fixture failure'); end");
    expect(() => applications.update(saved.id, { status: "applied", note: "手动投递" })).toThrow("fixture failure");
    expect(applications.get(saved.id)).toMatchObject({ status: "saved", note: "" });
    expect(applications.events(saved.id)).toHaveLength(1);
  });
});
