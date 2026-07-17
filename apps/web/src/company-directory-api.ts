import {
  ApiErrorSchema,
  CompanyDirectoryListQuerySchema,
  CompanyDirectoryListSchema,
  CompanyDirectoryScanResultSchema,
  type CompanyDirectoryList,
  type CompanyDirectoryListQuery,
  type CompanyDirectoryScanResult,
} from "@campus-job-agent/contracts";

export interface CompanyDirectoryApi {
  list(query: CompanyDirectoryListQuery): Promise<CompanyDirectoryList>;
  scanOfferBiu(): Promise<CompanyDirectoryScanResult>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}

export const browserCompanyDirectoryApi: CompanyDirectoryApi = {
  async list(query) {
    const input = CompanyDirectoryListQuerySchema.parse(query);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) search.set(key, String(value));
    return CompanyDirectoryListSchema.parse(await request(`/api/companies?${search.toString()}`));
  },
  async scanOfferBiu() {
    return CompanyDirectoryScanResultSchema.parse(await request("/api/companies/scan/offerbiu", { method: "POST" }));
  },
};
