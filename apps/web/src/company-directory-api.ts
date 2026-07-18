import {
  ApiErrorSchema,
  CompanyDirectoryListQuerySchema,
  CompanyDirectoryListSchema,
  type CompanyDirectoryList,
  type CompanyDirectoryListQuery,
} from "@campus-job-agent/contracts";

export interface CompanyDirectoryApi {
  list(query: CompanyDirectoryListQuery): Promise<CompanyDirectoryList>;
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
};
