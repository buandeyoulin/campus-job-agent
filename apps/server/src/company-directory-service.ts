import {
  CompanyListQuerySchema,
  CompanySeedImportResultSchema,
  type CompanyList,
  type CompanySeedImportResult,
} from "@campus-job-agent/contracts";
import { loadSemiconductorCompanySeed, type SeedCompanyRecord } from "@campus-job-agent/sources";
import type { CompanyRepository } from "@campus-job-agent/storage";

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
  loadSeed?: () => SeedCompanyRecord[];
  now?: () => Date;
}

export class CompanyDirectoryService {
  constructor(private readonly dependencies: CompanyDirectoryServiceDependencies) {}

  list(query: unknown): CompanyList {
    return this.dependencies.repository.listCompanies(CompanyListQuerySchema.parse(query));
  }

  importSeed(): CompanySeedImportResult {
    const records = (this.dependencies.loadSeed ?? loadSemiconductorCompanySeed)();
    let created = 0;
    for (const record of records) {
      this.dependencies.repository.transaction(() => {
        const { careerSources, ...companyInput } = record;
        const result = this.dependencies.repository.upsertSeed(companyInput);
        if (result.created) created += 1;
        for (const source of careerSources) {
          this.dependencies.repository.upsertCareerSource(result.company.id, {
            canonicalUrl: source.url,
            kind: source.kind,
            adapter: source.adapter,
            verificationEvidence: source.evidence,
          });
        }
      });
    }
    return CompanySeedImportResultSchema.parse({
      fetched: records.length,
      created,
      updated: records.length - created,
      completedAt: (this.dependencies.now ?? (() => new Date()))().toISOString(),
    });
  }
}
