import {
  CompanyListQuerySchema,
  type CompanyList,
} from "@campus-job-agent/contracts";
import type { CompanyRepository } from "@campus-job-agent/storage";

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
}

export class CompanyDirectoryService {
  constructor(private readonly dependencies: CompanyDirectoryServiceDependencies) {}

  list(query: unknown): CompanyList {
    return this.dependencies.repository.listCompanies(CompanyListQuerySchema.parse(query));
  }
}
