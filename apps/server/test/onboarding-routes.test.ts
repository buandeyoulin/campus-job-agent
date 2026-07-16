import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ApiErrorSchema,
  OnboardingSnapshotSchema,
  ProfileFactSchema,
} from "@campus-job-agent/contracts";
import { FactRepository, openDatabase, ProfileRepository, ResumeRepository, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { OnboardingService } from "../src/onboarding-service.js";

const WEB_ORIGIN = "http://127.0.0.1:4318";
const API_ORIGIN = "http://127.0.0.1:4317";
const roots: string[] = [];
const apps: FastifyInstance[] = [];
const storages: StorageDatabase[] = [];

const profile = {
  displayName: "林同学",
  email: "",
  phone: "",
  currentCity: "武汉",
  degree: "本科",
  major: "计算机科学与技术",
  graduationDate: "2027-06",
};

const preferences = {
  targetRoles: ["前端开发实习生"],
  excludedRoles: [],
  recruitmentTypes: ["campus"],
  targetCities: ["上海"],
  remotePreference: "no_preference",
  availabilityFrom: "",
  availabilityTo: "",
  daysPerWeek: null,
  minimumDurationMonths: null,
  preferredIndustries: ["软件"],
  preferredCompanies: [],
  companyBlacklist: [],
};

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const profiles = new ProfileRepository(storage.db);
  const facts = new FactRepository(storage.db);
  const resumes = new ResumeRepository(storage.db);
  const onboarding = new OnboardingService({ profiles, facts, resumes });
  const app = buildApp({ onboarding, allowedOrigins: new Set([WEB_ORIGIN, API_ORIGIN]) });
  apps.push(app);
  return { app, profiles, facts, resumes };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const storage of storages.splice(0)) storage.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("onboarding routes", () => {
  it("returns an empty validated onboarding snapshot", async () => {
    const { app } = await setup();
    const response = await app.inject({ method: "GET", url: "/api/onboarding" });

    expect(response.statusCode).toBe(200);
    expect(OnboardingSnapshotSchema.parse(response.json())).toMatchObject({
      profile: null,
      preferences: null,
      activeResume: null,
      facts: { education: [], internship: [], project: [], skill: [] },
      factCounts: { pending: 0, confirmed: 0, rejected: 0 },
    });
  });

  it("rejects missing, null, remote, and unexpected-port origins before mutation", async () => {
    const { app } = await setup();

    for (const origin of [undefined, "null", "https://malicious.example", "http://127.0.0.1:9999"]) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: origin ? { origin } : {},
        payload: profile,
      });
      expect(response.statusCode).toBe(403);
      expect(ApiErrorSchema.parse(response.json()).error.code).toBe("origin_not_allowed");
    }
  });

  it("accepts both configured loopback origins and upserts a profile", async () => {
    const { app } = await setup();
    const first = await app.inject({ method: "PUT", url: "/api/profile", headers: { origin: WEB_ORIGIN }, payload: profile });
    const second = await app.inject({ method: "PUT", url: "/api/profile", headers: { origin: API_ORIGIN }, payload: { ...profile, currentCity: "成都" } });

    expect(first.statusCode).toBe(200);
    expect(OnboardingSnapshotSchema.parse(second.json()).profile?.currentCity).toBe("成都");
  });

  it("requires a profile before saving preferences and then persists them", async () => {
    const { app } = await setup();
    const blocked = await app.inject({ method: "PUT", url: "/api/preferences", headers: { origin: WEB_ORIGIN }, payload: preferences });
    expect(blocked.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(blocked.json()).error.code).toBe("profile_required");

    await app.inject({ method: "PUT", url: "/api/profile", headers: { origin: WEB_ORIGIN }, payload: profile });
    const saved = await app.inject({ method: "PUT", url: "/api/preferences", headers: { origin: WEB_ORIGIN }, payload: preferences });
    expect(saved.statusCode).toBe(200);
    expect(OnboardingSnapshotSchema.parse(saved.json()).preferences).toEqual(preferences);
  });

  it("creates, edits, confirms, rejects, deletes, and batch-confirms facts", async () => {
    const { app } = await setup();
    await app.inject({ method: "PUT", url: "/api/profile", headers: { origin: WEB_ORIGIN }, payload: profile });

    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/facts",
      headers: { origin: WEB_ORIGIN },
      payload: { content: { type: "skill", name: "TypeScript", category: "编程语言", evidence: "课程项目" } },
    });
    const created = ProfileFactSchema.parse(createdResponse.json());
    expect(createdResponse.statusCode).toBe(201);

    const editedResponse = await app.inject({
      method: "PATCH",
      url: `/api/facts/${created.id}`,
      headers: { origin: WEB_ORIGIN },
      payload: { content: { ...created.content, evidence: "课程和社团项目" } },
    });
    expect(ProfileFactSchema.parse(editedResponse.json()).content).toMatchObject({ evidence: "课程和社团项目" });

    const confirmed = await app.inject({ method: "POST", url: `/api/facts/${created.id}/confirm`, headers: { origin: WEB_ORIGIN } });
    expect(ProfileFactSchema.parse(confirmed.json()).status).toBe("confirmed");
    const conflict = await app.inject({ method: "POST", url: `/api/facts/${created.id}/reject`, headers: { origin: WEB_ORIGIN } });
    expect(ApiErrorSchema.parse(conflict.json()).error.code).toBe("fact_state_conflict");

    const second = ProfileFactSchema.parse((await app.inject({ method: "POST", url: "/api/facts", headers: { origin: WEB_ORIGIN }, payload: { content: { type: "skill", name: "SQL", category: "数据库", evidence: "课程" } } })).json());
    const third = ProfileFactSchema.parse((await app.inject({ method: "POST", url: "/api/facts", headers: { origin: WEB_ORIGIN }, payload: { content: { type: "project", name: "校园平台", role: "开发者", startDate: "2025-01", endDate: "2025-06", bullets: ["实现报名流程"], technologies: ["React"] } } })).json());
    const batch = await app.inject({ method: "POST", url: "/api/facts/confirm-batch", headers: { origin: WEB_ORIGIN }, payload: { ids: [second.id, third.id] } });
    expect(OnboardingSnapshotSchema.parse(batch.json()).factCounts.confirmed).toBe(3);

    const rejectedDraft = ProfileFactSchema.parse((await app.inject({ method: "POST", url: "/api/facts", headers: { origin: WEB_ORIGIN }, payload: { content: { type: "skill", name: "Python", category: "编程语言", evidence: "" } } })).json());
    await app.inject({ method: "POST", url: `/api/facts/${rejectedDraft.id}/reject`, headers: { origin: WEB_ORIGIN } });
    const reopened = await app.inject({ method: "PATCH", url: `/api/facts/${rejectedDraft.id}`, headers: { origin: WEB_ORIGIN }, payload: { content: { ...rejectedDraft.content, evidence: "数据课程" } } });
    expect(ProfileFactSchema.parse(reopened.json()).status).toBe("pending");
    const removed = await app.inject({ method: "DELETE", url: `/api/facts/${rejectedDraft.id}`, headers: { origin: WEB_ORIGIN } });
    expect(removed.statusCode).toBe(204);
  });

  it("returns stable fact and validation errors without internal details", async () => {
    const { app } = await setup();
    const missing = await app.inject({ method: "POST", url: "/api/facts/00000000-0000-4000-8000-000000000099/confirm", headers: { origin: WEB_ORIGIN } });
    expect(missing.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(missing.json())).toEqual({ error: { code: "fact_not_found", message: "事实记录不存在" } });

    const invalid = await app.inject({ method: "PUT", url: "/api/profile", headers: { origin: WEB_ORIGIN }, payload: { ...profile, displayName: "" } });
    expect(invalid.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(invalid.json())).toEqual({ error: { code: "validation_failed", message: "输入内容无效" } });
  });

  it("does not misclassify an unexpected repository failure as a state conflict", async () => {
    const { app, profiles, facts } = await setup();
    profiles.saveProfile(profile);
    const created = facts.create({ status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: { type: "skill", name: "SQL", category: "数据库", evidence: "" }, fingerprint: "skill:sql", duplicateOfFactId: null });
    facts.confirm = () => {
      throw new Error("SQL failed at C:\\private\\data.sqlite");
    };

    const response = await app.inject({ method: "POST", url: `/api/facts/${created.id}/confirm`, headers: { origin: WEB_ORIGIN } });

    expect(response.statusCode).toBe(500);
    expect(ApiErrorSchema.parse(response.json())).toEqual({ error: { code: "internal_error", message: "请求处理失败" } });
    expect(response.body).not.toContain("private");
  });

  it("marks a resume completed after its final pending fact is reviewed", async () => {
    const { app, profiles, facts, resumes } = await setup();
    profiles.saveProfile(profile);
    const resume = resumes.create({ originalFileName: "虚构简历.pdf", storedRelativePath: "resumes/original/resume.pdf", kind: "pdf", byteSize: 100, sha256: "a".repeat(64) });
    resumes.updateState(resume.id, { parseStatus: "parsed", extractionStatus: "awaiting_confirmation" });
    const candidate = facts.create({ status: "pending", source: "resume", resumeUploadId: resume.id, sourceExcerpt: "TypeScript 项目", content: { type: "skill", name: "TypeScript", category: "编程语言", evidence: "项目" }, fingerprint: "skill:typescript", duplicateOfFactId: null });

    await app.inject({ method: "POST", url: `/api/facts/${candidate.id}/confirm`, headers: { origin: WEB_ORIGIN } });
    expect(resumes.get(resume.id)?.extractionStatus).toBe("completed");
  });
});
