import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StructuredAiProvider, StructuredRequest } from "@campus-job-agent/ai-providers";
import { OnboardingSnapshotSchema, ProfileFactSchema, ResumeUploadSummarySchema } from "@campus-job-agent/contracts";
import { parseResume } from "@campus-job-agent/profile";
import { Document, Packer, Paragraph } from "docx";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createProductionServices, type ProductionServices } from "../src/services.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const apps: FastifyInstance[] = [];

class FakeProvider implements StructuredAiProvider {
  constructor(private readonly replies: unknown[]) {}
  async generate<T>(_request: StructuredRequest<T>): Promise<T> {
    return this.replies.shift() as T;
  }
}

function multipart(data: Buffer) {
  const boundary = "----campus-job-agent-e2e";
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="fictional-resume.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { origin: ORIGIN, "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

function appFor(services: ProductionServices): FastifyInstance {
  const app = buildApp({ onboarding: services.onboarding, allowedOrigins: new Set([ORIGIN]), resumeRoutes: services.resumeRoutes });
  app.addHook("onClose", async () => services.close());
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("profile onboarding acceptance", () => {
  it("persists the complete fictional onboarding flow across a server restart", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-e2e-"));
    roots.push(root);
    const skill = { type: "skill" as const, name: "TypeScript", category: "编程语言", evidence: "课程项目" };
    const education = { type: "education" as const, school: "示例大学", degree: "本科", major: "软件工程", startDate: "2023-09", endDate: "2027-06", details: "" };
    const provider = new FakeProvider([{ facts: [
      { content: education, sourceExcerpt: "示例大学 软件工程" },
      { content: skill, sourceExcerpt: "TypeScript 课程项目" },
    ] }]);
    const jobs: Promise<void>[] = [];
    const services = await createProductionServices(
      { CAMPUS_JOB_AGENT_DATA_DIR: root },
      { provider, parse: parseResume, enqueue: (work) => jobs.push(work()) },
    );
    const first = appFor(services);

    expect((await first.inject({ method: "PUT", url: "/api/profile", headers: { origin: ORIGIN }, payload: {
      displayName: "林同学", email: "", phone: "", currentCity: "武汉", degree: "本科", major: "软件工程", graduationDate: "2027-06",
    } })).statusCode).toBe(200);
    expect((await first.inject({ method: "PUT", url: "/api/preferences", headers: { origin: ORIGIN }, payload: {
      targetRoles: ["前端开发实习生"], excludedRoles: [], recruitmentTypes: ["campus"], targetCities: ["上海"], remotePreference: "no_preference",
      availabilityFrom: "", availabilityTo: "", daysPerWeek: null, minimumDurationMonths: null, preferredIndustries: ["软件"], preferredCompanies: [], companyBlacklist: [],
    } })).statusCode).toBe(200);

    const manual = ProfileFactSchema.parse((await first.inject({ method: "POST", url: "/api/facts", headers: { origin: ORIGIN }, payload: { content: skill } })).json());
    await first.inject({ method: "POST", url: `/api/facts/${manual.id}/confirm`, headers: { origin: ORIGIN } });

    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph("林同学 示例大学 软件工程"),
      new Paragraph("TypeScript 课程项目"),
    ] }] }));
    const uploaded = ResumeUploadSummarySchema.parse((await first.inject({ method: "POST", url: "/api/resumes", ...multipart(docx) })).json());
    const accepted = await first.inject({ method: "POST", url: `/api/resumes/${uploaded.id}/extract`, headers: { origin: ORIGIN }, payload: { acknowledgedCloudProcessing: true } });
    expect(accepted.statusCode).toBe(202);
    await Promise.all(jobs);

    let current = OnboardingSnapshotSchema.parse((await first.inject({ method: "GET", url: "/api/onboarding" })).json());
    const facts = Object.values(current.facts).flat();
    expect(facts).toHaveLength(2);
    expect(facts.filter((item) => item.content.type === "skill")).toHaveLength(1);
    const extracted = facts.find((item) => item.content.type === "education")!;
    await first.inject({ method: "PATCH", url: `/api/facts/${extracted.id}`, headers: { origin: ORIGIN }, payload: { content: { ...education, details: "已人工核对" } } });
    await first.inject({ method: "POST", url: `/api/facts/${extracted.id}/confirm`, headers: { origin: ORIGIN } });
    current = OnboardingSnapshotSchema.parse((await first.inject({ method: "GET", url: "/api/onboarding" })).json());
    expect(current.activeResume?.extractionStatus).toBe("completed");

    const record = services.resumes.getRecord(uploaded.id)!;
    expect(await services.files.readOriginal(record.storedRelativePath)).toEqual(docx);
    expect(await services.files.readParsed(record.parsedRelativePath!)).toContain("示例大学");
    await first.close();
    apps.splice(apps.indexOf(first), 1);

    const restartedServices = await createProductionServices(
      { CAMPUS_JOB_AGENT_DATA_DIR: root },
      { provider: new FakeProvider([]), parse: parseResume, enqueue: (work) => { void work(); } },
    );
    const restarted = appFor(restartedServices);
    const persisted = OnboardingSnapshotSchema.parse((await restarted.inject({ method: "GET", url: "/api/onboarding" })).json());
    expect(persisted.profile?.displayName).toBe("林同学");
    expect(persisted.preferences?.targetRoles).toEqual(["前端开发实习生"]);
    expect(persisted.activeResume).toMatchObject({ id: uploaded.id, parseStatus: "parsed", extractionStatus: "completed" });
    expect(Object.values(persisted.facts).flat().filter((item) => item.status === "confirmed")).toHaveLength(2);

    const persistedRecord = restartedServices.resumes.getRecord(uploaded.id)!;
    expect(await restartedServices.files.readParsed(persistedRecord.parsedRelativePath!)).toContain("TypeScript");
    expect((await stat(restartedServices.files.resolveInsideRoot(persistedRecord.storedRelativePath))).isFile()).toBe(true);
    expect((await stat(restartedServices.files.resolveInsideRoot(persistedRecord.parsedRelativePath!))).isFile()).toBe(true);
  });
});
