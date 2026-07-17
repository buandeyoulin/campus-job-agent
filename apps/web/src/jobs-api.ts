import {
  ApiErrorSchema,
  JobListQuerySchema,
  JobListSchema,
  ScanResultSchema,
  SourceStatusSchema,
  type JobList,
  type JobListQuery,
  type ScanResult,
  type SourceStatus,
} from "@campus-job-agent/contracts";

export interface JobsApi {
  list(query: JobListQuery): Promise<JobList>;
  scanTencent(): Promise<ScanResult>;
  sourceStatuses(): Promise<SourceStatus[]>;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}

export const browserJobsApi: JobsApi = {
  async list(query) {
    const input = JobListQuerySchema.parse(query);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) search.set(key, String(value));
    return JobListSchema.parse(await request(`/api/jobs?${search.toString()}`));
  },
  async scanTencent() {
    return ScanResultSchema.parse(await request("/api/jobs/scan/tencent", { method: "POST" }));
  },
  async sourceStatuses() {
    return SourceStatusSchema.array().parse(await request("/api/sources"));
  },
};
