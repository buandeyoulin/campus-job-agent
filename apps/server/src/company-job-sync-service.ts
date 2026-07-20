import { OfficialJobSyncRequestSchema, OfficialJobSyncResultSchema, type OfficialJobSyncResult } from "@campus-job-agent/contracts";
import type { CareerSourceAdapter } from "@campus-job-agent/sources";
import type { CompanyRepository, JobRepository } from "@campus-job-agent/storage";

export interface CompanyJobSyncServiceDependencies {
  companies: CompanyRepository;
  jobs: JobRepository;
  adapters: readonly CareerSourceAdapter[];
  now?: () => Date;
}

export interface CompanyJobSyncOptions { companyId?: string; dueOnly?: boolean }

export class CompanyJobSyncService {
  constructor(private readonly dependencies: CompanyJobSyncServiceDependencies) {}

  async sync(value: CompanyJobSyncOptions = {}): Promise<OfficialJobSyncResult> {
    const request = OfficialJobSyncRequestSchema.parse(value.companyId ? { companyId: value.companyId } : {});
    const now = this.dependencies.now ?? (() => new Date());
    const targets = this.dependencies.companies.listEligibleCareerSources({
      ...(request.companyId ? { companyId: request.companyId } : {}),
      at: now().toISOString(),
      dueOnly: value.dueOnly ?? false,
    });
    const counts = { sourcesSucceeded: 0, sourcesSkipped: 0, sourcesFailed: 0, jobsFetched: 0, created: 0, updated: 0 };
    for (const { company, source } of targets) {
      const adapter = this.dependencies.adapters.find((candidate) => candidate.supports(source));
      if (!adapter) {
        counts.sourcesSkipped += 1;
        continue;
      }
      try {
        const capturedAt = now().toISOString();
        const batch = await adapter.fetch(source, { company, capturedAt });
        this.dependencies.companies.transaction(() => {
          const seen = new Set<string>();
          for (const job of batch.jobs) {
            const result = this.dependencies.jobs.upsertOfficialJob(company.id, source.id, job);
            seen.add(job.sourceJobId);
            if (result.created) counts.created += 1;
            else counts.updated += 1;
          }
          if (batch.completeness === "complete") this.dependencies.jobs.completeOfficialSourceScan(source.id, seen, batch.sourceCheckedAt);
          this.dependencies.companies.recordSourceSync(source.id, { succeeded: true, complete: batch.completeness === "complete" });
          const delay = batch.jobs.length > 0 ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
          this.dependencies.companies.scheduleCareerSource(source.id, new Date(now().getTime() + delay).toISOString());
        });
        counts.jobsFetched += batch.jobs.length;
        counts.sourcesSucceeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Official source synchronization failed";
        this.dependencies.companies.recordSourceSync(source.id, { succeeded: false, error: message });
        counts.sourcesFailed += 1;
      }
    }
    return OfficialJobSyncResultSchema.parse({ sourcesSelected: targets.length, ...counts, completedAt: now().toISOString() });
  }
}
