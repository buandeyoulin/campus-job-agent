import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FactRepository,
  openDatabase,
  ProfileRepository,
  ResumeRepository,
  type StorageDatabase,
} from "../src/index.js";

const roots: string[] = [];
const openStorages: StorageDatabase[] = [];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-repo-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  openStorages.push(storage);
  return {
    storage,
    repository: new ProfileRepository(storage.db, () => new Date("2026-07-16T00:00:00.000Z")),
  };
}

afterEach(async () => {
  for (const storage of openStorages.splice(0)) {
    try {
      storage.close();
    } catch {
      // Tests may close the connection before cleanup.
    }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("profile repository", () => {
  it("returns null before either card has been saved", async () => {
    const { storage, repository } = await setup();

    expect(repository.getProfile()).toBeNull();
    expect(repository.getPreferences()).toBeNull();
    storage.close();
  });

  it("upserts and revalidates the singleton profile", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({
      displayName: "虚构候选人",
      email: "candidate@example.test",
      phone: "",
      currentCity: "成都",
      degree: "本科",
      major: "信息管理",
      graduationDate: "2027-06",
    });

    const updated = repository.saveProfile({
      displayName: "虚构候选人",
      email: "candidate@example.test",
      phone: "138 0013 8000",
      currentCity: "重庆",
      degree: "本科",
      major: "信息管理",
      graduationDate: "2027-06",
    });

    expect(updated.phone).toBe("13800138000");
    expect(repository.getProfile()).toEqual(updated);
    expect(repository.getProfile()?.currentCity).toBe("重庆");
    storage.close();
  });

  it("persists and replaces validated preferences after the profile exists", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "成都", degree: "本科", major: "信息管理", graduationDate: "2027-06" });

    repository.savePreferences({
      targetRoles: ["产品实习生"],
      excludedRoles: ["销售"],
      recruitmentTypes: ["daily_internship"],
      targetCities: ["成都"],
      remotePreference: "hybrid",
      availabilityFrom: "2026-08-01",
      availabilityTo: "2027-01-31",
      daysPerWeek: 4,
      minimumDurationMonths: 4,
      preferredIndustries: ["软件"],
      preferredCompanies: [],
      companyBlacklist: [],
    });

    const replaced = repository.savePreferences({
      targetRoles: ["产品实习生", "项目助理"],
      excludedRoles: [],
      recruitmentTypes: ["campus"],
      targetCities: ["重庆", "成都"],
      remotePreference: "onsite",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: ["软件"],
      preferredCompanies: ["示例科技"],
      companyBlacklist: [],
    });

    expect(repository.getPreferences()).toEqual(replaced);
    expect(repository.getPreferences()?.targetCities).toEqual(["重庆", "成都"]);
    storage.close();
  });

  it("does not create preferences without a saved profile", async () => {
    const { storage, repository } = await setup();

    expect(() => repository.savePreferences({
      targetRoles: ["测试开发"],
      excludedRoles: [],
      recruitmentTypes: ["campus"],
      targetCities: ["深圳"],
      remotePreference: "onsite",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: [],
      preferredCompanies: [],
      companyBlacklist: [],
    })).toThrow("Profile must be saved before preferences");
    storage.close();
  });
});

describe("fact repository", () => {
  it("creates, lists, finds, edits, and confirms a manual fact", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const facts = new FactRepository(storage.db, () => new Date("2026-07-16T00:00:00.000Z"));

    const created = facts.create({
      status: "pending",
      source: "manual",
      resumeUploadId: null,
      sourceExcerpt: null,
      content: { type: "skill", name: "TypeScript", category: "编程语言", evidence: "课程项目" },
      fingerprint: "skill:typescript:v1",
      duplicateOfFactId: null,
    });
    const updated = facts.update(
      created.id,
      { type: "skill", name: "TypeScript", category: "编程语言", evidence: "课程与社团项目" },
      "skill:typescript:v2",
      null,
    );

    expect(facts.list()).toEqual([updated]);
    expect(facts.findByFingerprint("skill:typescript:v1")).toBeNull();
    expect(facts.findByFingerprint("skill:typescript:v2")?.id).toBe(created.id);
    expect(facts.confirm(created.id).status).toBe("confirmed");
    storage.close();
  });

  it("returns a rejected fact to pending when edited and explicitly deletes it", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const facts = new FactRepository(storage.db);
    const created = facts.create({
      status: "pending",
      source: "manual",
      resumeUploadId: null,
      sourceExcerpt: null,
      content: { type: "skill", name: "SQL", category: "数据库", evidence: "" },
      fingerprint: "skill:sql",
      duplicateOfFactId: null,
    });

    expect(facts.reject(created.id).status).toBe("rejected");
    expect(facts.findByFingerprint("skill:sql")).toBeNull();
    expect(facts.update(created.id, { ...created.content, evidence: "课程练习" }, "skill:sql:v2", null).status).toBe("pending");
    expect(facts.delete(created.id)).toBe(true);
    expect(facts.delete(created.id)).toBe(false);
    storage.close();
  });

  it("rolls back createMany when any linked record is invalid", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const facts = new FactRepository(storage.db);

    expect(() => facts.createMany([
      { status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: { type: "skill", name: "Go", category: "编程语言", evidence: "" }, fingerprint: "skill:go", duplicateOfFactId: null },
      { status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: { type: "skill", name: "Java", category: "编程语言", evidence: "" }, fingerprint: "skill:java", duplicateOfFactId: "00000000-0000-4000-8000-000000000099" },
    ])).toThrow();
    expect(facts.list()).toEqual([]);
    storage.close();
  });

  it("atomically confirms only pending facts", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const facts = new FactRepository(storage.db);
    const pending = facts.create({ status: "pending", source: "manual", resumeUploadId: null, sourceExcerpt: null, content: { type: "skill", name: "SQL", category: "数据库", evidence: "" }, fingerprint: "skill:sql", duplicateOfFactId: null });
    const rejected = facts.create({ status: "rejected", source: "resume", resumeUploadId: null, sourceExcerpt: "虚构片段", content: { type: "skill", name: "Java", category: "编程语言", evidence: "" }, fingerprint: "skill:java", duplicateOfFactId: null });

    expect(() => facts.confirmBatch([pending.id, rejected.id])).toThrow("Fact state conflict");
    expect(facts.get(pending.id)?.status).toBe("pending");
    expect(facts.confirmBatch([pending.id]).map((fact) => fact.status)).toEqual(["confirmed"]);
    storage.close();
  });
});

describe("resume repository", () => {
  it("keeps one active resume, exposes paths, and reactivates a repeated upload", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const resumes = new ResumeRepository(storage.db, () => new Date("2026-07-16T00:00:00.000Z"));

    const first = resumes.create({ originalFileName: "resume-a.docx", storedRelativePath: "resumes/original/a.docx", kind: "docx", byteSize: 100, sha256: "a".repeat(64) });
    const second = resumes.create({ originalFileName: "resume-b.pdf", storedRelativePath: "resumes/original/b.pdf", kind: "pdf", byteSize: 200, sha256: "b".repeat(64) });

    expect(resumes.getActive()?.id).toBe(second.id);
    expect(resumes.findByHash(first.sha256)?.id).toBe(first.id);
    expect(resumes.getRecord(first.id)).toMatchObject({ storedRelativePath: "resumes/original/a.docx", parsedRelativePath: null });
    expect(resumes.activate(first.id).isActive).toBe(true);
    expect(resumes.getActive()?.id).toBe(first.id);
    storage.close();
  });

  it("updates persisted state and marks unfinished work interrupted", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const resumes = new ResumeRepository(storage.db, () => new Date("2026-07-16T00:00:00.000Z"));
    const parsing = resumes.create({ originalFileName: "parsing.pdf", storedRelativePath: "resumes/original/parsing.pdf", kind: "pdf", byteSize: 100, sha256: "c".repeat(64) });
    const queued = resumes.create({ originalFileName: "queued.pdf", storedRelativePath: "resumes/original/queued.pdf", kind: "pdf", byteSize: 100, sha256: "d".repeat(64) });
    const extracting = resumes.create({ originalFileName: "extracting.pdf", storedRelativePath: "resumes/original/extracting.pdf", kind: "pdf", byteSize: 100, sha256: "e".repeat(64) });
    resumes.updateState(parsing.id, { parseStatus: "parsing" });
    resumes.updateState(queued.id, { extractionStatus: "queued" });
    resumes.updateState(extracting.id, { parsedRelativePath: "resumes/parsed/extracting.txt", parseStatus: "parsed", extractionStatus: "extracting", warnings: ["文档包含可能影响解析的格式"] });

    expect(resumes.markInterrupted()).toBe(3);
    expect(resumes.get(parsing.id)).toMatchObject({ parseStatus: "failed", failureCode: "interrupted" });
    expect(resumes.get(queued.id)).toMatchObject({ extractionStatus: "failed", failureCode: "interrupted" });
    expect(resumes.getRecord(extracting.id)).toMatchObject({ parsedRelativePath: "resumes/parsed/extracting.txt", summary: { extractionStatus: "failed", warnings: ["文档包含可能影响解析的格式"] } });
    storage.close();
  });

  it("deletes unconfirmed extracted facts but preserves confirmed facts without provenance", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "", degree: "", major: "", graduationDate: "" });
    const resumes = new ResumeRepository(storage.db);
    const facts = new FactRepository(storage.db);
    const resume = resumes.create({ originalFileName: "resume.docx", storedRelativePath: "resumes/original/r.docx", kind: "docx", byteSize: 100, sha256: "f".repeat(64) });
    const pending = facts.create({ status: "pending", source: "resume", resumeUploadId: resume.id, sourceExcerpt: "待确认", content: { type: "skill", name: "Go", category: "编程语言", evidence: "" }, fingerprint: "skill:go", duplicateOfFactId: null });
    const confirmed = facts.create({ status: "confirmed", source: "resume", resumeUploadId: resume.id, sourceExcerpt: "已确认", content: { type: "skill", name: "Python", category: "编程语言", evidence: "" }, fingerprint: "skill:python", duplicateOfFactId: null });

    expect(resumes.deleteWithUnconfirmedFacts(resume.id)).toBe(true);
    expect(facts.get(pending.id)).toBeNull();
    expect(facts.get(confirmed.id)?.resumeUploadId).toBeNull();
    expect(resumes.get(resume.id)).toBeNull();
    storage.close();
  });
});
