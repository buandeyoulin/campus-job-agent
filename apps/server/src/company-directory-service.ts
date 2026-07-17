import {
  CompanyDirectoryListQuerySchema,
  CompanyDirectoryScanResultSchema,
  type CompanyDirectoryEntryInput,
  type CompanyDirectoryList,
  type CompanyDirectoryScanResult,
} from "@campus-job-agent/contracts";
import type { CompanyRepository } from "@campus-job-agent/storage";

export class CompanyDirectoryUnavailableError extends Error {
  constructor() {
    super("Public company directory unavailable");
    this.name = "CompanyDirectoryUnavailableError";
  }
}

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
  fetchOfferBiu: () => Promise<CompanyDirectoryEntryInput[]>;
  now?: () => Date;
}

export class CompanyDirectoryService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CompanyDirectoryServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  list(query: unknown): CompanyDirectoryList {
    return this.dependencies.repository.list(CompanyDirectoryListQuerySchema.parse(query));
  }

  async scanOfferBiu(): Promise<CompanyDirectoryScanResult> {
    let entries: CompanyDirectoryEntryInput[];
    try {
      entries = await this.dependencies.fetchOfferBiu();
    } catch {
      throw new CompanyDirectoryUnavailableError();
    }
    let created = 0;
    let updated = 0;
    for (const entry of entries) {
      const result = this.dependencies.repository.upsert(entry);
      if (result.created) created += 1;
      else updated += 1;
    }
    return CompanyDirectoryScanResultSchema.parse({
      source: "offerbiu",
      fetched: entries.length,
      created,
      updated,
      completedAt: this.now().toISOString(),
    });
  }
}
