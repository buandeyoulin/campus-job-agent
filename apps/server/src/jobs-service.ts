import {
  JobImportSchema,
  JobListQuerySchema,
  ScanResultSchema,
  type JobImport,
  type JobList,
  type JobListQuery,
  type NormalizedJob,
  type ScanResult,
  type SourceStatus,
  type StoredJob,
} from "@campus-job-agent/contracts";
import type { JobRepository } from "@campus-job-agent/storage";

export class PublicSourceUnavailableError extends Error {
  constructor(readonly source: string) {
    super("Public source unavailable");
    this.name = "PublicSourceUnavailableError";
  }
}

export interface JobsServiceDependencies {
  repository: JobRepository;
  fetchTencent: () => Promise<NormalizedJob[]>;
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

  sourceStatuses(): SourceStatus[] {
    const statuses = this.dependencies.repository.getSourceStatuses();
    return statuses.length > 0 ? statuses : [{
      source: "tencent",
      available: false,
      message: "尚未检查腾讯公开职位来源",
      lastCheckedAt: null,
    }];
  }

  async scanTencent(): Promise<ScanResult> {
    let discovered: NormalizedJob[];
    try {
      discovered = await this.dependencies.fetchTencent();
    } catch {
      this.dependencies.repository.recordScan({ source: "tencent", succeeded: false, message: "腾讯公开职位来源暂时不可用" });
      throw new PublicSourceUnavailableError("tencent");
    }
    const result = this.persist("tencent", discovered);
    this.dependencies.repository.recordScan({ source: "tencent", succeeded: true, message: `已读取 ${result.fetched} 个公开岗位` });
    return result;
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
