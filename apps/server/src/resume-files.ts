import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiFailure } from "./errors.js";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export type ResumeKind = "pdf" | "docx";

export interface ValidatedUpload {
  displayFileName: string;
  kind: ResumeKind;
  byteSize: number;
  sha256: string;
}

export interface StoredUpload {
  kind: ResumeKind;
  byteSize: number;
  sha256: string;
  storedRelativePath: string;
}

const MIME_TYPES: Record<ResumeKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hasSignature(kind: ResumeKind, data: Buffer): boolean {
  if (kind === "pdf") return data.subarray(0, 5).toString("ascii") === "%PDF-";
  return data.length >= 4
    && data[0] === 0x50
    && data[1] === 0x4b
    && data[2] === 0x03
    && data[3] === 0x04;
}

export class ResumeFileStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  inspectUpload(input: {
    originalFileName: string;
    declaredMimeType: string;
    data: Buffer;
  }): ValidatedUpload {
    if (input.data.length === 0) {
      throw new ApiFailure(400, "validation_failed", "简历文件不能为空");
    }
    if (input.data.length > MAX_RESUME_BYTES) {
      throw new ApiFailure(413, "resume_too_large", "简历文件不能超过 10 MiB");
    }

    const extension = path.extname(input.originalFileName).toLowerCase();
    const kind: ResumeKind | null = extension === ".pdf" ? "pdf" : extension === ".docx" ? "docx" : null;
    if (!kind || input.declaredMimeType !== MIME_TYPES[kind] || !hasSignature(kind, input.data)) {
      throw new ApiFailure(415, "resume_type_not_allowed", "仅支持有效的 PDF 或 DOCX 简历");
    }

    const displayFileName = path.win32.basename(path.posix.basename(input.originalFileName)).slice(0, 255);
    if (!displayFileName) {
      throw new ApiFailure(400, "validation_failed", "简历文件名无效");
    }
    return {
      displayFileName,
      kind,
      byteSize: input.data.length,
      sha256: sha256(input.data),
    };
  }

  async storeUpload(input: ValidatedUpload & { data: Buffer }): Promise<StoredUpload> {
    if (
      input.data.length !== input.byteSize
      || sha256(input.data) !== input.sha256
      || !hasSignature(input.kind, input.data)
    ) {
      throw new ApiFailure(400, "validation_failed", "简历文件校验结果不一致");
    }

    const generatedName = `${randomUUID()}.${input.kind}`;
    const relativePath = path.posix.join("resumes", "original", generatedName);
    const finalPath = this.resolveInsideRoot(relativePath);
    const temporaryPath = path.join(path.dirname(finalPath), `.${generatedName}.tmp`);
    await mkdir(path.dirname(finalPath), { recursive: true });
    try {
      await writeFile(temporaryPath, input.data, { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, finalPath);
      return {
        kind: input.kind,
        byteSize: input.byteSize,
        sha256: input.sha256,
        storedRelativePath: relativePath,
      };
    } catch {
      await rm(temporaryPath, { force: true });
      throw new ApiFailure(500, "internal_error", "简历文件保存失败");
    }
  }

  async writeParsedText(resumeId: string, text: string): Promise<string> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeId)) {
      throw new ApiFailure(400, "validation_failed", "简历记录编号无效");
    }
    const relativePath = path.posix.join("resumes", "parsed", `${resumeId}.txt`);
    const finalPath = this.resolveInsideRoot(relativePath);
    const temporaryPath = `${finalPath}.tmp`;
    await mkdir(path.dirname(finalPath), { recursive: true });
    try {
      await writeFile(temporaryPath, text, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, finalPath);
      return relativePath;
    } catch {
      await rm(temporaryPath, { force: true });
      throw new ApiFailure(500, "internal_error", "解析文本保存失败");
    }
  }

  async readOriginal(relativePath: string): Promise<Buffer> {
    return readFile(this.resolveInsideRoot(relativePath));
  }

  async readParsed(relativePath: string): Promise<string> {
    return readFile(this.resolveInsideRoot(relativePath), "utf8");
  }

  async remove(relativePaths: Array<string | null>): Promise<void> {
    try {
      await Promise.all(relativePaths.filter((value): value is string => value !== null).map((relativePath) => (
        rm(this.resolveInsideRoot(relativePath), { force: true })
      )));
    } catch {
      throw new ApiFailure(500, "file_cleanup_failed", "简历文件清理失败");
    }
  }

  resolveInsideRoot(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new ApiFailure(400, "validation_failed", "文件路径无效");
    }
    const candidate = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, candidate);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new ApiFailure(400, "validation_failed", "文件路径无效");
    }
    return candidate;
  }
}
