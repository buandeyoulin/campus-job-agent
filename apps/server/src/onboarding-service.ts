import {
  FactBatchConfirmSchema,
  FactCreateSchema,
  FactUpdateSchema,
  JobPreferencesSchema,
  ProfileDraftSchema,
  type FactGroups,
  type OnboardingSnapshot,
  type ProfileFact,
} from "@campus-job-agent/contracts";
import { calculateProfileCompletion, factFingerprint } from "@campus-job-agent/profile";
import {
  type FactRepository,
  type ProfileRepository,
  type ResumeRepository,
} from "@campus-job-agent/storage";
import { z } from "zod";
import { ApiFailure } from "./errors.js";

export interface OnboardingDependencies {
  profiles: ProfileRepository;
  facts: FactRepository;
  resumes: ResumeRepository;
}

export class OnboardingService {
  constructor(private readonly dependencies: OnboardingDependencies) {}

  getSnapshot(): OnboardingSnapshot {
    const profile = this.dependencies.profiles.getProfile();
    const preferences = this.dependencies.profiles.getPreferences();
    const facts = this.dependencies.facts.list();
    const grouped: FactGroups = { education: [], internship: [], project: [], skill: [] };
    for (const fact of facts) grouped[fact.content.type].push(fact);

    return {
      profile,
      preferences,
      completion: calculateProfileCompletion(profile, preferences, facts),
      activeResume: this.dependencies.resumes.getActive(),
      facts: grouped,
      factCounts: {
        pending: facts.filter((fact) => fact.status === "pending").length,
        confirmed: facts.filter((fact) => fact.status === "confirmed").length,
        rejected: facts.filter((fact) => fact.status === "rejected").length,
      },
    };
  }

  saveProfile(input: unknown): OnboardingSnapshot {
    this.dependencies.profiles.saveProfile(ProfileDraftSchema.parse(input));
    return this.getSnapshot();
  }

  savePreferences(input: unknown): OnboardingSnapshot {
    if (!this.dependencies.profiles.getProfile()) {
      throw new ApiFailure(409, "profile_required", "请先保存基本信息");
    }
    this.dependencies.profiles.savePreferences(JobPreferencesSchema.parse(input));
    return this.getSnapshot();
  }

  createFact(input: unknown): ProfileFact {
    if (!this.dependencies.profiles.getProfile()) {
      throw new ApiFailure(409, "profile_required", "请先保存基本信息");
    }
    const { content } = FactCreateSchema.parse(input);
    return this.dependencies.facts.create({
      status: "pending",
      source: "manual",
      resumeUploadId: null,
      sourceExcerpt: null,
      content,
      fingerprint: factFingerprint(content),
      duplicateOfFactId: null,
    });
  }

  updateFact(idInput: string, input: unknown): ProfileFact {
    const id = z.uuid().parse(idInput);
    const existing = this.requireFact(id);
    const { content } = FactUpdateSchema.parse(input);
    const updated = this.dependencies.facts.update(
      id,
      content,
      factFingerprint(content),
      existing.duplicateOfFactId,
    );
    if (updated.resumeUploadId && updated.status === "pending") {
      this.dependencies.resumes.updateState(updated.resumeUploadId, {
        extractionStatus: "awaiting_confirmation",
        failureCode: null,
      });
    }
    return updated;
  }

  confirmFact(idInput: string): ProfileFact {
    const id = z.uuid().parse(idInput);
    const existing = this.requireFact(id);
    const result = this.changeFactState(() => this.dependencies.facts.confirm(id));
    this.settleResumes([existing.resumeUploadId]);
    return result;
  }

  rejectFact(idInput: string): ProfileFact {
    const id = z.uuid().parse(idInput);
    const existing = this.requireFact(id);
    const result = this.changeFactState(() => this.dependencies.facts.reject(id));
    this.settleResumes([existing.resumeUploadId]);
    return result;
  }

  deleteFact(idInput: string): void {
    const id = z.uuid().parse(idInput);
    const existing = this.requireFact(id);
    if (!this.dependencies.facts.delete(id)) {
      throw new ApiFailure(404, "fact_not_found", "事实记录不存在");
    }
    this.settleResumes([existing.resumeUploadId]);
  }

  confirmFacts(input: unknown): OnboardingSnapshot {
    const { ids } = FactBatchConfirmSchema.parse(input);
    const existing = ids.map((id) => this.requireFact(id));
    this.changeFactState(() => this.dependencies.facts.confirmBatch(ids));
    this.settleResumes(existing.map((fact) => fact.resumeUploadId));
    return this.getSnapshot();
  }

  private requireFact(id: string): ProfileFact {
    const fact = this.dependencies.facts.get(id);
    if (!fact) throw new ApiFailure(404, "fact_not_found", "事实记录不存在");
    return fact;
  }

  private changeFactState<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof Error && error.message === "Fact state conflict") {
        throw new ApiFailure(409, "fact_state_conflict", "事实状态不允许此操作");
      }
      if (error instanceof Error && error.message === "Fact not found") {
        throw new ApiFailure(404, "fact_not_found", "事实记录不存在");
      }
      throw error;
    }
  }

  private settleResumes(resumeIds: Array<string | null>): void {
    const uniqueIds = new Set(resumeIds.filter((id): id is string => id !== null));
    if (uniqueIds.size === 0) return;
    const facts = this.dependencies.facts.list();
    for (const resumeId of uniqueIds) {
      const stillPending = facts.some((fact) => fact.resumeUploadId === resumeId && fact.status === "pending");
      if (!stillPending && this.dependencies.resumes.get(resumeId)) {
        this.dependencies.resumes.updateState(resumeId, {
          extractionStatus: "completed",
          failureCode: null,
        });
      }
    }
  }
}
