import {
  JobImportSchema,
  OfferBiuBridgeBatchSchema,
  OfferBiuVisibleImportSchema,
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
import { mapOfferBiuPosting } from "@campus-job-agent/sources";
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
  fetchOfferBiu: () => Promise<NormalizedJob[]>;
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

  async scanOfferBiu(): Promise<ScanResult> {
    let discovered: NormalizedJob[];
    try {
      discovered = await this.dependencies.fetchOfferBiu();
    } catch {
      this.dependencies.repository.recordScan({ source: "offerbiu", succeeded: false, message: "OfferBiu 岗位源暂时不可用" });
      throw new PublicSourceUnavailableError("offerbiu");
    }
    const result = this.persist("offerbiu", discovered);
    this.dependencies.repository.recordScan({ source: "offerbiu", succeeded: true, message: `已读取 ${result.fetched} 条 OfferBiu 招聘信息` });
    return result;
  }

  importJobs(input: unknown): ScanResult {
    const parsed = JobImportSchema.parse(input);
    return this.persist("manual", parsed.jobs);
  }

  importOfferBiuVisible(input: unknown): ScanResult {
    const payload = OfferBiuVisibleImportSchema.parse(input);
    const capturedAt = this.now().toISOString();
    const jobs = payload.records.map((record) => ({
      source: "offerbiu-authenticated",
      sourceJobId: `${record.company}\u0000${record.roles}\u0000${record.applyUrl}`,
      sourceUrl: record.applyUrl,
      title: record.roles,
      company: record.company,
      location: record.location,
      description: [
        "Visible in the user's signed-in OfferBiu recruitment library.",
        record.industry && `Industry: ${record.industry}`,
        record.cohort && `Cohort: ${record.cohort}`,
        record.deadline && `Deadline: ${record.deadline}`,
        record.requirement && `Requirements: ${record.requirement}`,
      ].filter(Boolean).join("\n"),
      capturedAt,
    }));
    return this.persist("offerbiu-authenticated", jobs);
  }

  importOfferBiuBridge(input: unknown): ScanResult {
    const payload = OfferBiuBridgeBatchSchema.parse(input);
    const capturedAt = this.now().toISOString();
    const jobs = payload.records
      .map((record) => mapOfferBiuPosting(record, capturedAt))
      .filter((job): job is NormalizedJob => job !== null);
    return this.persist("offerbiu", jobs);
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
