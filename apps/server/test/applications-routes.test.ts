import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationRepository, FactRepository, JobRepository, openDatabase, ProfileRepository, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { ApplicationsService } from "../src/applications-service.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = []; const storages: StorageDatabase[] = []; const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); storages.splice(0).forEach((item) => item.close()); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("application routes", () => {
  it("tracks manual progress and persists an AI resume and interview pack from confirmed facts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-application-api-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const jobs = new JobRepository(storage.db); const profiles = new ProfileRepository(storage.db); const facts = new FactRepository(storage.db);
    const repository = new ApplicationRepository(storage.db, () => new Date("2026-07-18T10:00:00.000Z"));
    profiles.saveProfile({ displayName: "Ray", email: "ray@example.com", phone: "", currentCity: "上海", degree: "本科", major: "微电子", graduationDate: "2027-06" });
    const confirmed = facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:uvm", content: { type: "skill", name: "UVM", category: "验证", evidence: "完成覆盖率收敛" } });
    facts.create({ status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:secret", content: { type: "skill", name: "unconfirmed-secret", category: "", evidence: "" } });
    const job = jobs.upsert({ source: "manual", sourceJobId: "1", sourceUrl: "https://careers.example.com/1", title: "数字 IC 验证工程师", company: "示例芯片", location: "上海", description: "负责 UVM 验证与覆盖率", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const generate = vi.fn(async () => ({
      selectedFactIds: [confirmed.id],
      interviewQuestions: [
        { question: "如何搭建 UVM 环境？", focus: "虚构：带领十人团队完成项目", factIds: [confirmed.id] },
        { question: "如何完成覆盖率收敛？", focus: "解释计划、缺口和回归", factIds: [confirmed.id] },
        { question: "为什么选择本岗位？", focus: "连接专业与验证经历", factIds: [confirmed.id] },
      ],
      gaps: ["尚无形式验证事实"],
    }));
    const service = new ApplicationsService({ repository, jobs, profiles, facts, provider: { generate } as never, renderResumePdf: async () => Buffer.from("%PDF-1.4\nfixture") });
    const app = buildApp({ applications: service, allowedOrigins: new Set([ORIGIN]) }); apps.push(app);

    const created = await app.inject({ method: "POST", url: "/api/applications", headers: { origin: ORIGIN }, payload: { jobId: job.id } });
    const applicationId = created.json().id as string;
    expect(created.statusCode).toBe(201);
    const prepared = await app.inject({ method: "POST", url: `/api/applications/${applicationId}/prepare`, headers: { origin: ORIGIN }, payload: {} });
    expect(prepared.json()).toMatchObject({ tailoredResumeMarkdown: expect.stringContaining("UVM"), interviewQuestions: expect.any(Array), gaps: ["尚无形式验证事实"] });
    expect(JSON.stringify(prepared.json())).not.toContain("带领十人团队");
    const pdf = await app.inject({ method: "GET", url: `/api/applications/${applicationId}/resume.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const updated = await app.inject({ method: "PATCH", url: `/api/applications/${applicationId}`, headers: { origin: ORIGIN }, payload: { status: "applied", note: "已在官网手动投递" } });
    expect(updated.json()).toMatchObject({ status: "applied", note: "已在官网手动投递" });
    const listed = await app.inject({ method: "GET", url: "/api/applications" });
    expect(listed.json()).toMatchObject([{ application: { id: applicationId, status: "applied" }, job: { id: job.id }, preparation: { tailoredResumeMarkdown: expect.stringContaining("UVM") } }]);
    const events = await app.inject({ method: "GET", url: `/api/applications/${applicationId}/events` });
    expect(events.json()).toHaveLength(2);
    expect(generate.mock.calls[0]?.[0].prompt).not.toContain("unconfirmed-secret");
  });

  it("rejects AI material output that cites an unknown fact id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-application-api-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const jobs = new JobRepository(storage.db); const profiles = new ProfileRepository(storage.db); const facts = new FactRepository(storage.db); const repository = new ApplicationRepository(storage.db);
    profiles.saveProfile({ displayName: "Ray", email: "", phone: "", currentCity: "", degree: "本科", major: "微电子", graduationDate: "2027-06" });
    facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:uvm", content: { type: "skill", name: "UVM", category: "验证", evidence: "项目" } });
    const job = jobs.upsert({ source: "manual", sourceJobId: "2", sourceUrl: "https://careers.example.com/2", title: "验证工程师", company: "示例", location: "", description: "UVM", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const unknown = "018a2c8a-51dc-7a81-a240-999999999999";
    const generate = vi.fn(async () => ({ selectedFactIds: [unknown], interviewQuestions: [1, 2, 3].map((index) => ({ question: `问题 ${index}`, focus: "只说事实", factIds: [unknown] })), gaps: [] }));
    const service = new ApplicationsService({ repository, jobs, profiles, facts, provider: { generate } as never, renderResumePdf: async () => Buffer.alloc(0) });
    const app = buildApp({ applications: service, allowedOrigins: new Set([ORIGIN]) }); apps.push(app);
    const application = repository.create(job.id);
    const response = await app.inject({ method: "POST", url: `/api/applications/${application.id}/prepare`, headers: { origin: ORIGIN }, payload: {} });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "ai_output_invalid" } });
    expect(repository.getPreparation(application.id)).toBeNull();
  });

  it("does not fail preparation when a legacy PDF cache cannot be removed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-application-cache-")); roots.push(root);
    const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
    const jobs = new JobRepository(storage.db); const profiles = new ProfileRepository(storage.db); const facts = new FactRepository(storage.db); const repository = new ApplicationRepository(storage.db);
    profiles.saveProfile({ displayName: "Ray", email: "", phone: "", currentCity: "", degree: "本科", major: "微电子", graduationDate: "2027-06" });
    const confirmed = facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:uvm-cache", content: { type: "skill", name: "UVM", category: "验证", evidence: "完成验证项目" } });
    const job = jobs.upsert({ source: "manual", sourceJobId: "cache", sourceUrl: "https://careers.example.com/cache", title: "验证工程师", company: "示例", location: "", description: "UVM", capturedAt: "2026-07-18T10:00:00.000Z" }).job;
    const application = repository.create(job.id);
    const outputRoot = path.join(root, "generated");
    await mkdir(path.join(outputRoot, `${application.id}-tailored-resume.pdf`, "locked"), { recursive: true });
    const generate = vi.fn(async () => ({
      selectedFactIds: [confirmed.id],
      interviewQuestions: [1, 2, 3].map((index) => ({ question: `问题 ${index}`, focus: "虚构内容", factIds: [confirmed.id] })),
      gaps: [],
    }));
    const service = new ApplicationsService({ repository, jobs, profiles, facts, provider: { generate } as never, outputRoot, renderResumePdf: async () => Buffer.from("%PDF-fresh") });
    const app = buildApp({ applications: service, allowedOrigins: new Set([ORIGIN]) }); apps.push(app);

    const response = await app.inject({ method: "POST", url: `/api/applications/${application.id}/prepare`, headers: { origin: ORIGIN }, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(repository.getPreparation(application.id)).not.toBeNull();
  });
});
