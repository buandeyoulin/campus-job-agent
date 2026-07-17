import { ApplicationCreateSchema, ApplicationUpdateSchema, type Application, type ApplicationUpdate } from "@campus-job-agent/contracts";
import type { ApplicationRepository } from "@campus-job-agent/storage";

export class ApplicationsService {
  constructor(private readonly repository: ApplicationRepository) {}
  create(input: unknown): Application { return this.repository.create(ApplicationCreateSchema.parse(input).jobId); }
  update(id: string, input: unknown): Application { return this.repository.update(id, ApplicationUpdateSchema.parse(input)); }
}
