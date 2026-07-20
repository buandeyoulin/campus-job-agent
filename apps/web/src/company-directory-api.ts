import {
  ApiErrorSchema,
  CompanyCandidateListQuerySchema,
  CompanyCandidateListSchema,
  CompanyCareerSourceMutationResultSchema,
  CompanyCareerSourceSchema,
  CompanyDiscoveryRunResultSchema,
  CompanyListQuerySchema,
  CompanyListSchema,
  CompanySeedImportResultSchema,
  ManualCompanyResultSchema,
  OfficialJobSyncResultSchema,
  type CompanyCandidateList,
  type CompanyCandidateListQuery,
  type CompanyCareerSource,
  type CompanyCareerSourceMutationResult,
  type CompanyDiscoveryRunResult,
  type CompanyList,
  type CompanyListQuery,
  type CompanySeedImportResult,
  type ManualCompanyResult,
  type OfficialJobSyncResult,
} from "@campus-job-agent/contracts";

export interface CompanyDirectoryApi {
  list(query: CompanyListQuery): Promise<CompanyList>;
  listCandidates(query: CompanyCandidateListQuery): Promise<CompanyCandidateList>;
  listCareerSources(companyId: string): Promise<CompanyCareerSource[]>;
  importSeed(): Promise<CompanySeedImportResult>;
  discover(queries?: string[]): Promise<CompanyDiscoveryRunResult>;
  syncJobs(companyId?: string): Promise<OfficialJobSyncResult>;
  addCompany(value: { canonicalName: string; homepageUrl: string }): Promise<ManualCompanyResult>;
  addCareerSource(companyId: string, canonicalUrl: string): Promise<CompanyCareerSourceMutationResult>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const search = (value: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) params.set(key, String(item));
  return params.toString();
};

export const browserCompanyDirectoryApi: CompanyDirectoryApi = {
  async list(query) {
    const input = CompanyListQuerySchema.parse(query);
    return CompanyListSchema.parse(await request(`/api/companies?${search(input)}`));
  },
  async listCandidates(query) {
    const input = CompanyCandidateListQuerySchema.parse(query);
    return CompanyCandidateListSchema.parse(await request(`/api/company-candidates?${search(input)}`));
  },
  async listCareerSources(companyId) {
    return CompanyCareerSourceSchema.array().parse(await request(`/api/companies/${companyId}/career-sources`));
  },
  async importSeed() {
    return CompanySeedImportResultSchema.parse(await request("/api/companies/seed/import", json("POST", {})));
  },
  async discover(queries = []) {
    return CompanyDiscoveryRunResultSchema.parse(await request("/api/companies/discover", json("POST", { queries })));
  },
  async syncJobs(companyId) {
    return OfficialJobSyncResultSchema.parse(await request("/api/companies/jobs/sync", json("POST", companyId ? { companyId } : {})));
  },
  async addCompany(value) {
    return ManualCompanyResultSchema.parse(await request("/api/companies", json("POST", value)));
  },
  async addCareerSource(companyId, canonicalUrl) {
    return CompanyCareerSourceMutationResultSchema.parse(await request(`/api/companies/${companyId}/career-sources`, json("POST", { canonicalUrl })));
  },
};
