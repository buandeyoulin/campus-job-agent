import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, ResumeFileStore } from "../src/resume-files.js";

const roots: string[] = [];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-files-"));
  roots.push(root);
  return { root, files: new ResumeFileStore(root) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resume file store", () => {
  it("inspects and stores a PDF under a generated path confined to the data root", async () => {
    const { root, files } = await setup();
    const data = Buffer.from("%PDF-1.4\nfictional resume");
    const inspected = files.inspectUpload({ originalFileName: "../../虚构简历.PDF", declaredMimeType: "application/pdf", data });
    const stored = await files.storeUpload({ ...inspected, data });

    expect(inspected.displayFileName).toBe("虚构简历.PDF");
    expect(stored.storedRelativePath).toMatch(/^resumes\/original\/[0-9a-f-]+\.pdf$/);
    expect(files.resolveInsideRoot(stored.storedRelativePath).startsWith(root)).toBe(true);
    expect(await readFile(files.resolveInsideRoot(stored.storedRelativePath))).toEqual(data);
    expect(await readdir(path.join(root, "resumes", "original"))).toHaveLength(1);
  });

  it("accepts DOCX ZIP magic and computes a repeatable SHA-256 before writing", async () => {
    const { files } = await setup();
    const data = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]);
    const first = files.inspectUpload({ originalFileName: "resume.docx", declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data });
    const second = files.inspectUpload({ originalFileName: "copy.docx", declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data });

    expect(first.kind).toBe("docx");
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.sha256).toBe(first.sha256);
  });

  it("rejects empty, oversized, MIME-mismatched, and signature-mismatched uploads without files", async () => {
    const { root, files } = await setup();
    const cases = [
      { originalFileName: "resume.pdf", declaredMimeType: "application/pdf", data: Buffer.alloc(0), code: "validation_failed" },
      { originalFileName: "resume.pdf", declaredMimeType: "application/pdf", data: Buffer.alloc(MAX_RESUME_BYTES + 1), code: "resume_too_large" },
      { originalFileName: "resume.pdf", declaredMimeType: "text/plain", data: Buffer.from("%PDF-1.4"), code: "resume_type_not_allowed" },
      { originalFileName: "resume.docx", declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: Buffer.from("not zip"), code: "resume_type_not_allowed" },
      { originalFileName: "resume.txt", declaredMimeType: "text/plain", data: Buffer.from("text"), code: "resume_type_not_allowed" },
    ];

    for (const input of cases) {
      expect(() => files.inspectUpload(input)).toThrow(expect.objectContaining({ code: input.code }));
    }
    await expect(readdir(path.join(root, "resumes", "original"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes and reads parsed text, removes files, and rejects traversal", async () => {
    const { files } = await setup();
    const data = Buffer.from("%PDF-1.4\nfictional resume");
    const inspected = files.inspectUpload({ originalFileName: "resume.pdf", declaredMimeType: "application/pdf", data });
    const stored = await files.storeUpload({ ...inspected, data });
    const parsedPath = await files.writeParsedText("00000000-0000-4000-8000-000000000001", "虚构简历文本");

    expect(await files.readParsed(parsedPath)).toBe("虚构简历文本");
    expect(() => files.resolveInsideRoot("../outside.txt")).toThrow(expect.objectContaining({ code: "validation_failed" }));
    await files.remove([stored.storedRelativePath, parsedPath, "resumes/original/missing.pdf", null]);
    await expect(readFile(files.resolveInsideRoot(stored.storedRelativePath))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
