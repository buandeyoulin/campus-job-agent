import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StructuredAiProvider, StructuredRequest } from "@campus-job-agent/ai-providers";
import { factFingerprint, type ParsedResume } from "@campus-job-agent/profile";
import { FactRepository, openDatabase, ProfileRepository, ResumeRepository, type StorageDatabase } from "@campus-job-agent/storage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractionJobRunner } from "../src/extraction-jobs.js";
import { ResumeFileStore } from "../src/resume-files.js";

class FakeProvider implements StructuredAiProvider {
  readonly requests: StructuredRequest<unknown>[] = [];
  constructor(readonly replies: Array<unknown | Error>) {}
  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    this.requests.push(request as StructuredRequest<unknown>);
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    return reply as T;
  }
}

const roots: string[] = [];
const storages: StorageDatabase[] = [];

async function setup(provider: FakeProvider, parsed: ParsedResume = { kind: "pdf", text: "虚构简历文本", pages: 1, warnings: [] }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-jobs-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const profiles = new ProfileRepository(storage.db);
  profiles.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
  const facts = new FactRepository(storage.db);
  const resumes = new ResumeRepository(storage.db);
  const files = new ResumeFileStore(root);
  const parse = vi.fn(async (): Promise<ParsedResume> => parsed);
  const runner = new ExtractionJobRunner({ resumes, facts, files, provider, parse });
  const data = Buffer.from("%PDF-1.4\nfictional resume");
  const inspected = files.inspectUpload({ originalFileName: "虚构简历.pdf", declaredMimeType: "application/pdf", data });
  const stored = await files.storeUpload({ ...inspected, data });
  const resume = resumes.create({ originalFileName: inspected.displayFileName, storedRelativePath: stored.storedRelativePath, kind: stored.kind, byteSize: stored.byteSize, sha256: stored.sha256 });
  return { runner, facts, resumes, files, resume, parse, provider };
}

afterEach(async () => {
  for (const storage of storages.splice(0)) storage.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("extraction job runner", () => {
  it("parses once, skips exact duplicates, and transactionally creates pending candidates", async () => {
    const skill = { type: "skill" as const, name: "TypeScript", category: "编程语言", evidence: "课程项目" };
    const education = { type: "education" as const, school: "示例大学", degree: "本科", major: "软件工程", startDate: "2023-09", endDate: "2027-06", details: "" };
    const provider = new FakeProvider([{ facts: [{ content: skill, sourceExcerpt: "TypeScript" }, { content: skill, sourceExcerpt: "TypeScript" }, { content: education, sourceExcerpt: "示例大学 软件工程" }] }]);
    const { runner, facts, resumes, files, resume, parse } = await setup(provider, { kind: "pdf", text: "虚构文本", pages: 1, warnings: ["private parser detail"] });
    facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: skill, fingerprint: factFingerprint(skill), duplicateOfFactId: null });

    await runner.run(resume.id);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(facts.list()).toHaveLength(2);
    expect(facts.list().find((fact) => fact.content.type === "education")).toMatchObject({ status: "pending", source: "resume", resumeUploadId: resume.id });
    expect(resumes.get(resume.id)).toMatchObject({ parseStatus: "parsed", extractionStatus: "awaiting_confirmation", warnings: ["文档包含可能影响解析的格式"] });
    expect(await files.readParsed(resumes.getRecord(resume.id)!.parsedRelativePath!)).toBe("虚构文本");
  });

  it("stores a similar-fact suggestion without overwriting the confirmed fact", async () => {
    const existingContent = { type: "skill" as const, name: "SQL", category: "数据库", evidence: "课程" };
    const candidateContent = { ...existingContent, evidence: "项目" };
    const provider = new FakeProvider([{ facts: [{ content: candidateContent, sourceExcerpt: "SQL 项目" }] }]);
    const { runner, facts, resume } = await setup(provider);
    const existing = facts.create({ status: "confirmed", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: existingContent, fingerprint: factFingerprint(existingContent), duplicateOfFactId: null });

    await runner.run(resume.id);

    expect(facts.get(existing.id)).toMatchObject({ status: "confirmed", content: existingContent });
    expect(facts.list().find((fact) => fact.resumeUploadId === resume.id)?.duplicateOfFactId).toBe(existing.id);
  });

  it("persists empty-text and parser failures without deleting the original", async () => {
    const empty = await setup(new FakeProvider([]), { kind: "pdf", text: "", pages: 1, warnings: [] });
    await empty.runner.run(empty.resume.id);
    expect(empty.resumes.get(empty.resume.id)).toMatchObject({ parseStatus: "failed", extractionStatus: "failed", failureCode: "resume_text_empty" });
    await expect(empty.files.readOriginal(empty.resumes.getRecord(empty.resume.id)!.storedRelativePath)).resolves.toBeInstanceOf(Buffer);

    const failed = await setup(new FakeProvider([]));
    failed.parse.mockRejectedValueOnce(new Error("private parser path"));
    await failed.runner.run(failed.resume.id);
    expect(failed.resumes.get(failed.resume.id)).toMatchObject({ parseStatus: "failed", extractionStatus: "failed", failureCode: "resume_parse_failed" });
  });

  it("persists extraction-output failure with no partial candidate writes and reuses parsed text on retry", async () => {
    const provider = new FakeProvider([new Error("AI provider returned schema-invalid JSON: private"), { facts: [] }]);
    const context = await setup(provider);
    await context.runner.run(context.resume.id);
    expect(context.resumes.get(context.resume.id)).toMatchObject({ parseStatus: "parsed", extractionStatus: "failed", failureCode: "extraction_output_invalid" });
    expect(context.facts.list()).toEqual([]);

    await context.runner.run(context.resume.id);
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(context.resumes.get(context.resume.id)).toMatchObject({ extractionStatus: "completed", failureCode: null });
  });

  it("marks queued, parsing, and extracting records interrupted during recovery", async () => {
    const context = await setup(new FakeProvider([]));
    context.resumes.updateState(context.resume.id, { extractionStatus: "queued" });

    expect(context.runner.recoverInterrupted()).toBe(1);
    expect(context.resumes.get(context.resume.id)).toMatchObject({ extractionStatus: "failed", failureCode: "interrupted" });
  });
});
