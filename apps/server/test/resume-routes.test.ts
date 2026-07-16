import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OperationAcceptedSchema, ResumeUploadSummarySchema } from "@campus-job-agent/contracts";
import { FactRepository, openDatabase, ProfileRepository, ResumeRepository, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { ExtractionJobRunner } from "../src/extraction-jobs.js";
import { OnboardingService } from "../src/onboarding-service.js";
import { ResumeFileStore } from "../src/resume-files.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];

function multipart(data: Buffer, filename = "虚构简历.pdf", mime = "application/pdf") {
  const boundary = "----campus-job-agent-test";
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { origin: ORIGIN, "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

function multipartWithTwoFiles() {
  const boundary = "----campus-job-agent-two-files";
  const file = (name: string) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\r\n`,
  );
  return {
    payload: Buffer.concat([file("first.pdf"), file("second.pdf"), Buffer.from(`--${boundary}--\r\n`)]),
    headers: { origin: ORIGIN, "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function setup(saveProfile = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-resume-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const profiles = new ProfileRepository(storage.db);
  if (saveProfile) profiles.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
  const facts = new FactRepository(storage.db);
  const resumes = new ResumeRepository(storage.db);
  const files = new ResumeFileStore(root);
  const run = vi.fn(async () => {});
  const runner = { run, recoverInterrupted: vi.fn(() => 0) } as unknown as ExtractionJobRunner;
  const jobs: Promise<void>[] = [];
  const onboarding = new OnboardingService({ profiles, facts, resumes });
  const app = buildApp({
    onboarding,
    allowedOrigins: new Set([ORIGIN]),
    resumeRoutes: { profiles, resumes, files, runner, enqueue: (work) => jobs.push(work()) },
  });
  apps.push(app);
  return { root, app, profiles, facts, resumes, files, run, jobs };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const storage of storages.splice(0)) storage.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resume routes", () => {
  it("requires a profile and configured Origin before upload", async () => {
    const missingProfile = await setup(false);
    const blocked = await missingProfile.app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.from("%PDF-1.4")) });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: "profile_required" } });

    const context = await setup();
    const request = multipart(Buffer.from("%PDF-1.4"));
    const forbidden = await context.app.inject({ method: "POST", url: "/api/resumes", payload: request.payload, headers: { ...request.headers, origin: "https://malicious.example" } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("uploads once and reactivates an identical SHA-256 record without a duplicate file", async () => {
    const { app, root, resumes } = await setup();
    const request = multipart(Buffer.from("%PDF-1.4\nfictional"));
    const first = await app.inject({ method: "POST", url: "/api/resumes", ...request });
    const uploaded = ResumeUploadSummarySchema.parse(first.json());
    const second = await app.inject({ method: "POST", url: "/api/resumes", ...request });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(ResumeUploadSummarySchema.parse(second.json()).id).toBe(uploaded.id);
    expect(resumes.getActive()?.id).toBe(uploaded.id);
    expect(await readFile(path.join(root, resumes.getRecord(uploaded.id)!.storedRelativePath))).toEqual(Buffer.from("%PDF-1.4\nfictional"));
  });

  it("rejects oversized or type-mismatched multipart files with stable codes", async () => {
    const { app } = await setup();
    const wrong = await app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.from("not pdf")) });
    expect(wrong.json()).toMatchObject({ error: { code: "resume_type_not_allowed" } });
    const large = await app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10 * 1024 * 1024)])) });
    expect(large.statusCode).toBe(413);
    expect(large.json()).toMatchObject({ error: { code: "resume_too_large" } });
    const extra = await app.inject({ method: "POST", url: "/api/resumes", ...multipartWithTwoFiles() });
    expect(extra.statusCode).toBe(400);
    expect(extra.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("requires explicit acknowledgement, queues first extraction, and rejects duplicate starts", async () => {
    const { app, resumes, jobs, run } = await setup();
    const uploaded = ResumeUploadSummarySchema.parse((await app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.from("%PDF-1.4")) })).json());
    const refused = await app.inject({ method: "POST", url: `/api/resumes/${uploaded.id}/extract`, headers: { origin: ORIGIN }, payload: { acknowledgedCloudProcessing: false } });
    expect(refused.statusCode).toBe(400);

    const accepted = await app.inject({ method: "POST", url: `/api/resumes/${uploaded.id}/extract`, headers: { origin: ORIGIN }, payload: { acknowledgedCloudProcessing: true } });
    expect(OperationAcceptedSchema.parse(accepted.json())).toEqual({ accepted: true });
    expect(resumes.get(uploaded.id)?.extractionStatus).toBe("queued");
    await Promise.all(jobs);
    expect(run).toHaveBeenCalledWith(uploaded.id);
    const conflict = await app.inject({ method: "POST", url: `/api/resumes/${uploaded.id}/extract`, headers: { origin: ORIGIN }, payload: { acknowledgedCloudProcessing: true } });
    expect(conflict.json()).toMatchObject({ error: { code: "resume_state_conflict" } });
  });

  it("resets parse failures for retry but retains successfully parsed state", async () => {
    const { app, resumes } = await setup();
    const uploaded = ResumeUploadSummarySchema.parse((await app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.from("%PDF-1.4")) })).json());
    resumes.updateState(uploaded.id, { parseStatus: "failed", extractionStatus: "failed", failureCode: "resume_parse_failed" });
    await app.inject({ method: "POST", url: `/api/resumes/${uploaded.id}/extract`, headers: { origin: ORIGIN }, payload: { acknowledgedCloudProcessing: true } });
    expect(resumes.get(uploaded.id)).toMatchObject({ parseStatus: "pending", extractionStatus: "queued", failureCode: null });
  });

  it("deletes files and unconfirmed facts while preserving confirmed facts", async () => {
    const { app, facts, resumes, files } = await setup();
    const uploaded = ResumeUploadSummarySchema.parse((await app.inject({ method: "POST", url: "/api/resumes", ...multipart(Buffer.from("%PDF-1.4")) })).json());
    const pending = facts.create({ status: "pending", source: "resume", resumeUploadId: uploaded.id, sourceExcerpt: "待确认", content: { type: "skill", name: "Go", category: "编程语言", evidence: "" }, fingerprint: "go", duplicateOfFactId: null });
    const confirmed = facts.create({ status: "confirmed", source: "resume", resumeUploadId: uploaded.id, sourceExcerpt: "已确认", content: { type: "skill", name: "SQL", category: "数据库", evidence: "" }, fingerprint: "sql", duplicateOfFactId: null });
    const storedPath = resumes.getRecord(uploaded.id)!.storedRelativePath;

    const response = await app.inject({ method: "DELETE", url: `/api/resumes/${uploaded.id}`, headers: { origin: ORIGIN } });
    expect(response.statusCode).toBe(204);
    expect(facts.get(pending.id)).toBeNull();
    expect(facts.get(confirmed.id)?.resumeUploadId).toBeNull();
    await expect(files.readOriginal(storedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
