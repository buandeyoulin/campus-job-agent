import {
  ApiErrorSchema,
  JobPreferencesSchema,
  OnboardingSnapshotSchema,
  OperationAcceptedSchema,
  ProfileDraftSchema,
  ProfileFactSchema,
  ResumeUploadSummarySchema,
  type CandidateFactContent,
  type JobPreferences,
  type OnboardingSnapshot,
  type ProfileDraft,
  type ProfileFact,
} from "@campus-job-agent/contracts";

export interface OnboardingApi {
  getSnapshot(): Promise<OnboardingSnapshot>;
  saveProfile(value: ProfileDraft): Promise<OnboardingSnapshot>;
  savePreferences(value: JobPreferences): Promise<OnboardingSnapshot>;
  createFact(content: CandidateFactContent): Promise<ProfileFact>;
  updateFact(id: string, content: CandidateFactContent): Promise<ProfileFact>;
  actOnFact(id: string, action: "confirm" | "reject" | "delete"): Promise<void | ProfileFact>;
  confirmFacts(ids: string[]): Promise<OnboardingSnapshot>;
  uploadResume(file: File): Promise<OnboardingSnapshot>;
  extractResume(id: string): Promise<void>;
  retryResume(id: string): Promise<void>;
  deleteResume(id: string): Promise<void>;
}

async function request(requestPath: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(requestPath, init);
  if (response.status === 204) return undefined;
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(ApiErrorSchema.parse(body).error.message);
  return body;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const browserOnboardingApi: OnboardingApi = {
  async getSnapshot() {
    return OnboardingSnapshotSchema.parse(await request("/api/onboarding"));
  },
  async saveProfile(value) {
    return OnboardingSnapshotSchema.parse(
      await request("/api/profile", json("PUT", ProfileDraftSchema.parse(value))),
    );
  },
  async savePreferences(value) {
    return OnboardingSnapshotSchema.parse(
      await request("/api/preferences", json("PUT", JobPreferencesSchema.parse(value))),
    );
  },
  async createFact(content) {
    return ProfileFactSchema.parse(await request("/api/facts", json("POST", { content })));
  },
  async updateFact(id, content) {
    return ProfileFactSchema.parse(await request(`/api/facts/${id}`, json("PATCH", { content })));
  },
  async actOnFact(id, action) {
    if (action === "delete") {
      await request(`/api/facts/${id}`, { method: "DELETE" });
      return undefined;
    }
    return ProfileFactSchema.parse(await request(`/api/facts/${id}/${action}`, { method: "POST" }));
  },
  async confirmFacts(ids) {
    return OnboardingSnapshotSchema.parse(
      await request("/api/facts/confirm-batch", json("POST", { ids })),
    );
  },
  async uploadResume(file) {
    const body = new FormData();
    body.append("resume", file);
    ResumeUploadSummarySchema.parse(await request("/api/resumes", { method: "POST", body }));
    return browserOnboardingApi.getSnapshot();
  },
  async extractResume(id) {
    OperationAcceptedSchema.parse(await request(
      `/api/resumes/${id}/extract`,
      json("POST", { acknowledgedCloudProcessing: true }),
    ));
  },
  async retryResume(id) {
    OperationAcceptedSchema.parse(await request(
      `/api/resumes/${id}/extract`,
      json("POST", { acknowledgedCloudProcessing: true }),
    ));
  },
  async deleteResume(id) {
    await request(`/api/resumes/${id}`, { method: "DELETE" });
  },
};
