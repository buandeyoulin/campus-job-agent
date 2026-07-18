import {
  CompanyDirectoryListQuerySchema,
  type CompanyDirectoryList,
} from "@campus-job-agent/contracts";
import type { CompanyRepository } from "@campus-job-agent/storage";

export interface CompanyDirectoryServiceDependencies {
  repository: CompanyRepository;
}

export class CompanyDirectoryService {
  constructor(private readonly dependencies: CompanyDirectoryServiceDependencies) {}

  list(query: unknown): CompanyDirectoryList {
    return this.dependencies.repository.list(CompanyDirectoryListQuerySchema.parse(query));
  }
}
