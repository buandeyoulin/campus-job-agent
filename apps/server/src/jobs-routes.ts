import type { FastifyInstance } from "fastify";
import { ApiFailure } from "./errors.js";
import { JobsService, PublicSourceUnavailableError } from "./jobs-service.js";

interface JobParams { id: string }

export function registerJobsRoutes(app: FastifyInstance, jobs: JobsService): void {
  app.get("/api/jobs", async (request) => jobs.list(request.query));
  app.get<{ Params: JobParams }>("/api/jobs/:id", async (request) => {
    const job = jobs.get(request.params.id);
    if (!job) throw new ApiFailure(404, "job_not_found", "职位记录不存在");
    return job;
  });
  app.get("/api/sources", async () => jobs.sourceStatuses());
  app.post("/api/jobs/scan/tencent", async () => {
    try {
      return await jobs.scanTencent();
    } catch (error) {
      if (error instanceof PublicSourceUnavailableError) {
        throw new ApiFailure(502, "source_unavailable", "公开职位来源暂时不可用");
      }
      throw error;
    }
  });
  app.post("/api/jobs/import", async (request, reply) => reply.code(201).send(jobs.importJobs(request.body)));
}
