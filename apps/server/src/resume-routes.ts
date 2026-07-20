import { ExtractionConsentSchema } from "@campus-job-agent/contracts";
import type { ProfileRepository, ResumeRepository } from "@campus-job-agent/storage";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiFailure } from "./errors.js";
import type { ExtractionJobRunner } from "./extraction-jobs.js";
import { MAX_RESUME_BYTES, type ResumeFileStore } from "./resume-files.js";

interface ResumeParams {
  id: string;
}

export interface ResumeRouteDependencies {
  profiles: ProfileRepository;
  resumes: ResumeRepository;
  files: ResumeFileStore;
  runner: ExtractionJobRunner;
  enqueue: (work: () => Promise<void>) => void;
}

function resumeId(value: string): string {
  return z.uuid().parse(value);
}

function isMultipartLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === "FST_REQ_FILE_TOO_LARGE";
}

function isMultipartPartsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT";
}

export function registerResumeRoutes(
  app: FastifyInstance,
  dependencies: ResumeRouteDependencies,
): void {
  app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { files: 2, fileSize: MAX_RESUME_BYTES, parts: 2 },
    });

    scope.post("/api/resumes", async (request, reply) => {
      if (!dependencies.profiles.getProfile()) {
        throw new ApiFailure(409, "profile_required", "请先保存基本资料");
      }

      let uploaded: { filename: string; mimetype: string; data: Buffer } | null = null;
      try {
        for await (const part of request.parts()) {
          if (part.type !== "file" || part.fieldname !== "resume" || uploaded) {
            throw new ApiFailure(400, "validation_failed", "只能上传一个 resume 文件");
          }
          const data = await part.toBuffer();
          if (part.file.truncated) {
            throw new ApiFailure(413, "resume_too_large", "简历文件不能超过 10 MiB");
          }
          uploaded = { filename: part.filename, mimetype: part.mimetype, data };
        }
      } catch (error) {
        if (isMultipartLimitError(error)) {
          throw new ApiFailure(413, "resume_too_large", "简历文件不能超过 10 MiB");
        }
        if (isMultipartPartsError(error)) {
          throw new ApiFailure(400, "validation_failed", "只能上传一个 resume 文件");
        }
        throw error;
      }
      if (!uploaded) {
        throw new ApiFailure(400, "validation_failed", "请上传一个简历文件");
      }

      const inspected = dependencies.files.inspectUpload({
        originalFileName: uploaded.filename,
        declaredMimeType: uploaded.mimetype,
        data: uploaded.data,
      });
      const existing = dependencies.resumes.findByHash(inspected.sha256);
      if (existing) {
        return reply.code(200).send(dependencies.resumes.activate(existing.id));
      }

      const stored = await dependencies.files.storeUpload({ ...inspected, data: uploaded.data });
      try {
        const created = dependencies.resumes.create({
          originalFileName: inspected.displayFileName,
          storedRelativePath: stored.storedRelativePath,
          kind: stored.kind,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
        });
        return reply.code(201).send(created);
      } catch (error) {
        await dependencies.files.remove([stored.storedRelativePath]);
        throw error;
      }
    });

    scope.post<{ Params: ResumeParams }>("/api/resumes/:id/extract", async (request, reply) => {
      const id = resumeId(request.params.id);
      ExtractionConsentSchema.parse(request.body);
      const record = dependencies.resumes.getRecord(id);
      if (!record) {
        throw new ApiFailure(404, "resume_not_found", "简历记录不存在");
      }
      if (record.summary.extractionStatus !== "not_started" && record.summary.extractionStatus !== "failed") {
        throw new ApiFailure(409, "resume_state_conflict", "当前简历不能开始提取");
      }

      dependencies.resumes.updateState(id, {
        parseStatus: record.summary.parseStatus === "failed" ? "pending" : record.summary.parseStatus,
        extractionStatus: "queued",
        failureCode: null,
      });
      dependencies.enqueue(() => dependencies.runner.run(id));
      return reply.code(202).send({ accepted: true as const });
    });

    scope.delete<{ Params: ResumeParams }>("/api/resumes/:id", async (request, reply) => {
      const id = resumeId(request.params.id);
      const record = dependencies.resumes.getRecord(id);
      if (!record) {
        throw new ApiFailure(404, "resume_not_found", "简历记录不存在");
      }
      dependencies.resumes.deleteWithUnconfirmedFacts(id);
      await dependencies.files.remove([record.storedRelativePath, record.parsedRelativePath]);
      return reply.code(204).send();
    });
  });
}
