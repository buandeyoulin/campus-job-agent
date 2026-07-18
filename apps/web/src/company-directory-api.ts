import {
  ApiErrorSchema,
  CompanyListQuerySchema,
  CompanyListSchema,
  type CompanyList,
  type CompanyListQuery,
} from "@campus-job-agent/contracts";

export interface CompanyDirectoryApi {
  list(query: CompanyListQuery): Promise<CompanyList>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}

export const browserCompanyDirectoryApi: CompanyDirectoryApi = {
  async list(query) {
    const input = CompanyListQuerySchema.parse(query);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) search.set(key, String(value));
    return CompanyListSchema.parse(await request(`/api/companies?${search.toString()}`));
  },
};
