import {
  ApiErrorSchema,
  ApplicationListSchema,
  ApplicationPreparationSchema,
  ApplicationSchema,
  JobMatchListSchema,
  type Application,
  type ApplicationDetail,
  type ApplicationPreparation,
  type ApplicationStatus,
  type JobMatchResult,
} from "@campus-job-agent/contracts";

export interface CareerOpsApi {
  listMatches(useAi: boolean): Promise<JobMatchResult[]>;
  listApplications(): Promise<ApplicationDetail[]>;
  createApplication(jobId: string): Promise<Application>;
  updateApplication(id: string, value: { status: ApplicationStatus; note: string }): Promise<Application>;
  prepareApplication(id: string): Promise<ApplicationPreparation>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const browserCareerOpsApi: CareerOpsApi = {
  async listMatches(useAi) { return JobMatchListSchema.parse(await request(useAi ? "/api/matches/analyze" : "/api/matches", useAi ? json("POST", {}) : undefined)); },
  async listApplications() { return ApplicationListSchema.parse(await request("/api/applications")); },
  async createApplication(jobId) { return ApplicationSchema.parse(await request("/api/applications", json("POST", { jobId }))); },
  async updateApplication(id, value) { return ApplicationSchema.parse(await request(`/api/applications/${id}`, json("PATCH", value))); },
  async prepareApplication(id) { return ApplicationPreparationSchema.parse(await request(`/api/applications/${id}/prepare`, json("POST", {}))); },
};
