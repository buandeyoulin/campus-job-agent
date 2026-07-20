import type { FastifyInstance } from "fastify";
import { ApiFailure } from "./errors.js";
import { JobsService } from "./jobs-service.js";
import type { CompanyJobSyncService } from "./company-job-sync-service.js";

interface JobParams { id: string }

export function registerJobsRoutes(app: FastifyInstance, jobs: JobsService, companyJobSync?: CompanyJobSyncService): void {
  app.get("/api/jobs", async (request) => jobs.list(request.query));
  app.get<{ Params: JobParams }>("/api/jobs/:id", async (request) => {
    const job = jobs.get(request.params.id);
    if (!job) throw new ApiFailure(404, "job_not_found", "职位记录不存在");
    return job;
  });
  app.post("/api/jobs/import", async (request, reply) => reply.code(201).send(jobs.importJobs(request.body)));
  if (companyJobSync) app.post("/api/companies/jobs/sync", async (request) => companyJobSync.sync((request.body ?? {}) as object));
}
