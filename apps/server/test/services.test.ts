import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openDatabase, ProfileRepository, ResumeRepository } from "@campus-job-agent/storage";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionServices } from "../src/services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("production services", () => {
  it("uses the configured data root and recovers interrupted extraction before serving", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-services-"));
    roots.push(root);
    const initial = await openDatabase({ dataRoot: root });
    new ProfileRepository(initial.db).saveProfile({
      displayName: "虚构候选人",
      email: "",
      phone: "",
      currentCity: "",
      degree: "",
      major: "",
      graduationDate: "",
    });
    const initialResumes = new ResumeRepository(initial.db);
    const resume = initialResumes.create({
      originalFileName: "resume.pdf",
      storedRelativePath: "resumes/original/resume.pdf",
      kind: "pdf",
      byteSize: 8,
      sha256: "a".repeat(64),
    });
    initialResumes.updateState(resume.id, { extractionStatus: "queued" });
    initial.close();

    const services = await createProductionServices({ CAMPUS_JOB_AGENT_DATA_DIR: root });
    expect(services.onboarding.getSnapshot().profile?.displayName).toBe("虚构候选人");
    expect(services.resumes.get(resume.id)).toMatchObject({
      extractionStatus: "failed",
      failureCode: "interrupted",
    });
    expect(services.files.resolveInsideRoot("resumes/original/resume.pdf")).toBe(
      path.join(root, "resumes", "original", "resume.pdf"),
    );
    services.close();

    const reopened = await openDatabase({ dataRoot: root });
    expect(new ResumeRepository(reopened.db).get(resume.id)?.failureCode).toBe("interrupted");
    reopened.close();
  });
});
