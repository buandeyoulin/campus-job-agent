import {
  JobImportSchema,
  JobListQuerySchema,
  ScanResultSchema,
  type JobList,
  type NormalizedJob,
  type ScanResult,
  type StoredJob,
} from "@campus-job-agent/contracts";
import type { JobRepository } from "@campus-job-agent/storage";

export interface JobsServiceDependencies {
  repository: JobRepository;
  now?: () => Date;
}

export class JobsService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: JobsServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  list(query: unknown): JobList {
    return this.dependencies.repository.list(JobListQuerySchema.parse(query));
  }

  get(id: string): StoredJob | null {
    return this.dependencies.repository.get(id);
  }

  importJobs(input: unknown): ScanResult {
    const parsed = JobImportSchema.parse(input);
    return this.persist("manual", parsed.jobs);
  }

  private persist(source: string, values: NormalizedJob[]): ScanResult {
    let created = 0;
    let updated = 0;
    for (const value of values) {
      const result = this.dependencies.repository.upsert(value);
      if (result.created) created += 1;
      else updated += 1;
    }
    return ScanResultSchema.parse({
      source,
      fetched: values.length,
      created,
      updated,
      completedAt: this.now().toISOString(),
    });
  }
}
