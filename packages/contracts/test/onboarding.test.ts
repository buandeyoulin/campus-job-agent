import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CandidateFactContentSchema,
  JobPreferencesSchema,
  OnboardingSnapshotSchema,
  OperationAcceptedSchema,
  ProfileDraftSchema,
} from "../src/index.js";

const emptyCompletion = { percentage: 0, completed: [], missing: ["profile.name"] };

describe("onboarding contracts", () => {
  it("accepts optional local contact fields and normalizes a phone number", () => {
    const profile = ProfileDraftSchema.parse({
      displayName: "林同学",
      email: "",
      phone: "138 0013-8000",
      currentCity: "武汉",
      degree: "本科",
      major: "计算机科学与技术",
      graduationDate: "2027-06",
    });

    expect(profile.displayName).toBe("林同学");
    expect(profile.phone).toBe("13800138000");
  });

  it("rejects an empty name and malformed graduation month", () => {
    expect(() => ProfileDraftSchema.parse({
      displayName: "",
      email: "",
      phone: "",
      currentCity: "",
      degree: "",
      major: "",
      graduationDate: "2027-13",
    })).toThrow();
  });

  it("allows recruitment types to remain empty in a saved draft", () => {
    expect(JobPreferencesSchema.parse({
      targetRoles: [],
      excludedRoles: [],
      recruitmentTypes: [],
      targetCities: [],
      remotePreference: "no_preference",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: [],
      preferredCompanies: [],
      companyBlacklist: [],
    }).recruitmentTypes).toEqual([]);
  });

  it("requires availability when an internship type is selected", () => {
    const result = JobPreferencesSchema.safeParse({
      targetRoles: ["前端开发实习生"],
      excludedRoles: [],
      recruitmentTypes: ["daily_internship"],
      targetCities: ["上海"],
      remotePreference: "no_preference",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: [],
      preferredCompanies: [],
      companyBlacklist: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts each supported fact variant", () => {
    const facts = [
      { type: "education", school: "示例大学", degree: "本科", major: "软件工程", startDate: "2023-09", endDate: "2027-06", details: "" },
      { type: "internship", company: "示例科技", role: "研发实习生", startDate: "2026-01", endDate: "2026-06", bullets: ["为内部工具编写测试"] },
      { type: "project", name: "校园活动平台", role: "开发者", startDate: "2025-03", endDate: "2025-07", bullets: ["实现报名流程"], technologies: ["TypeScript"] },
      { type: "skill", name: "TypeScript", category: "编程语言", evidence: "课程和项目使用" },
    ];

    expect(facts.map((fact) => CandidateFactContentSchema.parse(fact).type)).toEqual(["education", "internship", "project", "skill"]);
  });

  it("rejects a model-invented skill proficiency field", () => {
    expect(() => CandidateFactContentSchema.parse({
      type: "skill",
      name: "Rust",
      category: "编程语言",
      evidence: "",
      proficiency: "expert",
    })).toThrow();
  });

  it("validates stable API responses and an empty onboarding snapshot", () => {
    expect(ApiErrorSchema.parse({ error: { code: "validation_failed", message: "输入内容无效" } }).error.code).toBe("validation_failed");
    expect(OperationAcceptedSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(OnboardingSnapshotSchema.parse({
      profile: null,
      preferences: null,
      completion: emptyCompletion,
      activeResume: null,
      facts: { education: [], internship: [], project: [], skill: [] },
      factCounts: { pending: 0, confirmed: 0, rejected: 0 },
    }).facts).toEqual({ education: [], internship: [], project: [], skill: [] });
  });

  it("rejects a fact placed in the wrong response group", () => {
    const skill = {
      id: "00000000-0000-4000-8000-000000000001",
      status: "pending",
      source: "manual",
      resumeUploadId: null,
      sourceExcerpt: null,
      content: { type: "skill", name: "SQL", category: "数据库", evidence: "课程项目" },
      duplicateOfFactId: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      confirmedAt: null,
    };

    expect(() => OnboardingSnapshotSchema.parse({
      profile: null,
      preferences: null,
      completion: emptyCompletion,
      activeResume: null,
      facts: { education: [skill], internship: [], project: [], skill: [] },
      factCounts: { pending: 1, confirmed: 0, rejected: 0 },
    })).toThrow();
  });
});
