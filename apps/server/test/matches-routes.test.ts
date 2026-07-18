import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StructuredAiProvider } from "@campus-job-agent/ai-providers";
import { FactRepository, JobRepository, openDatabase, ProfileRepository, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MatchService } from "../src/matching-service.js";

const roots: string[] = []; const storages: StorageDatabase[] = []; const apps: FastifyInstance[] = [];
async function setup(provider?: StructuredAiProvider) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-matches-")); roots.push(root);
  const storage = await openDatabase({ dataRoot: root }); storages.push(storage);
  const profiles = new ProfileRepository(storage.db); const facts = new FactRepository(storage.db); const jobs = new JobRepository(storage.db);
  const app = buildApp({ matches: new MatchService({ profiles, facts, jobs, ...(provider ? { provider } : {}) }), allowedOrigins: new Set() }); apps.push(app);
  return { app, profiles, facts, jobs };
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); storages.splice(0).forEach((storage) => storage.close()); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("match routes", () => {
  it("returns ranked explainable matches from confirmed local facts", async () => {
    const { app, profiles, facts, jobs } = await setup();
    profiles.saveProfile({ displayName: "林同学", email: "", phone: "", currentCity: "上海", degree: "本科", major: "计算机", graduationDate: "2027-06" });
    profiles.savePreferences({ targetRoles: ["前端开发实习生"], excludedRoles: [], recruitmentTypes: ["daily_internship"], targetCities: ["上海"], remotePreference: "no_preference", availabilityFrom: "2026-08-01", availabilityTo: "2027-01-31", daysPerWeek: 4, minimumDurationMonths: 4, preferredIndustries: [], preferredCompanies: [], companyBlacklist: [] });
    facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:ts", content: { type: "skill", name: "TypeScript", category: "语言", evidence: "项目" } });
    jobs.upsert({ source: "manual", sourceJobId: "1", sourceUrl: "https://careers.example.com/1", title: "前端开发实习生", company: "示例科技", location: "上海", description: "需要 TypeScript", capturedAt: "2026-07-17T10:00:00.000Z" });
    const response = await app.inject({ method: "GET", url: "/api/matches" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ eligible: true, score: 75, evidence: ["目标岗位方向匹配", "城市：上海", "技能：TypeScript"] }]);
  });

  it("uses AI to assess ranked jobs from confirmed facts without leaking pending facts", async () => {
    const generate = vi.fn(async (request: { prompt: string }) => [{
      jobId: request.prompt.match(/[0-9a-f-]{36}/i)?.[0], fitScore: 92, summary: "验证经验与岗位高度匹配",
      strengths: ["UVM 项目"], gaps: ["形式验证经历尚未确认"],
    }]);
    const { app, profiles, facts, jobs } = await setup({ generate } as never);
    profiles.saveProfile({ displayName: "Ray", email: "", phone: "", currentCity: "上海", degree: "本科", major: "微电子", graduationDate: "2027-06" });
    profiles.savePreferences({ targetRoles: ["数字 IC 验证"], excludedRoles: [], recruitmentTypes: ["campus"], targetCities: ["上海"], remotePreference: "no_preference", availabilityFrom: "", availabilityTo: "", daysPerWeek: null, minimumDurationMonths: null, preferredIndustries: ["半导体"], preferredCompanies: [], companyBlacklist: [] });
    facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:uvm", content: { type: "skill", name: "UVM", category: "验证", evidence: "搭建验证环境" } });
    facts.create({ status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, fingerprint: "skill:secret", content: { type: "skill", name: "unconfirmed-secret", category: "", evidence: "" } });
    const job = jobs.upsert({ source: "manual", sourceJobId: "ai-1", sourceUrl: "https://careers.example.com/ai-1", title: "数字 IC 验证工程师", company: "示例芯片", location: "上海", description: "负责 UVM 验证", capturedAt: "2026-07-18T10:00:00.000Z" }).job;

    const response = await app.inject({ method: "GET", url: "/api/matches?ai=true" });
    expect(response.json()).toMatchObject([{ job: { id: job.id }, aiAssessment: { fitScore: 92 }, score: 85 }]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0].prompt).toContain("UVM");
    expect(generate.mock.calls[0]?.[0].prompt).not.toContain("unconfirmed-secret");
  });
});
