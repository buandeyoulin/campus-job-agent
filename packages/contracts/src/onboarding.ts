import { z } from "zod";

const DraftText = z.string().trim().max(200);
const Month = z.union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]);
const DateText = z.union([z.literal(""), z.iso.date()]);
const UniqueTextList = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .refine((items) => new Set(items).size === items.length, "List values must be unique");
const Phone = z.string().trim().max(32).transform((value) => value.replace(/[ ()-]/g, ""));

export const ProfileDraftSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.union([z.literal(""), z.email()]).default(""),
  phone: Phone.default(""),
  currentCity: DraftText.default(""),
  degree: DraftText.default(""),
  major: DraftText.default(""),
  graduationDate: Month.default(""),
});
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

export const RecruitmentTypeSchema = z.enum(["campus", "daily_internship", "summer_internship"]);
export type RecruitmentType = z.infer<typeof RecruitmentTypeSchema>;

export const JobPreferencesSchema = z.object({
  targetRoles: UniqueTextList,
  excludedRoles: UniqueTextList,
  recruitmentTypes: z.array(RecruitmentTypeSchema).max(3),
  targetCities: UniqueTextList,
  remotePreference: z.enum(["onsite", "hybrid", "remote", "no_preference"]),
  availabilityFrom: DateText,
  availabilityTo: DateText,
  daysPerWeek: z.number().int().min(1).max(7).nullable(),
  minimumDurationMonths: z.number().int().min(1).max(24).nullable(),
  preferredIndustries: UniqueTextList,
  preferredCompanies: UniqueTextList,
  companyBlacklist: UniqueTextList,
}).superRefine((value, context) => {
  const internship = value.recruitmentTypes.some((type) => type !== "campus");
  if (!internship) return;
  if (!value.availabilityFrom) {
    context.addIssue({ code: "custom", path: ["availabilityFrom"], message: "Internship start date is required" });
  }
  if (!value.availabilityTo) {
    context.addIssue({ code: "custom", path: ["availabilityTo"], message: "Internship end date is required" });
  }
  if (value.daysPerWeek === null) {
    context.addIssue({ code: "custom", path: ["daysPerWeek"], message: "Days per week is required" });
  }
  if (value.minimumDurationMonths === null) {
    context.addIssue({ code: "custom", path: ["minimumDurationMonths"], message: "Minimum duration is required" });
  }
});
export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

const EvidenceBullets = z.array(z.string().trim().min(1).max(500)).max(20);

export const EducationFactSchema = z.object({
  type: z.literal("education"),
  school: DraftText.min(1),
  degree: DraftText.min(1),
  major: DraftText.min(1),
  startDate: Month,
  endDate: Month,
  details: z.string().trim().max(2_000),
}).strict();

export const InternshipFactSchema = z.object({
  type: z.literal("internship"),
  company: DraftText.min(1),
  role: DraftText.min(1),
  startDate: Month,
  endDate: Month,
  bullets: EvidenceBullets,
}).strict();

export const ProjectFactSchema = z.object({
  type: z.literal("project"),
  name: DraftText.min(1),
  role: DraftText,
  startDate: Month,
  endDate: Month,
  bullets: EvidenceBullets,
  technologies: UniqueTextList,
}).strict();

export const SkillFactSchema = z.object({
  type: z.literal("skill"),
  name: DraftText.min(1),
  category: DraftText,
  evidence: z.string().trim().max(500),
}).strict();

export const CandidateFactContentSchema = z.discriminatedUnion("type", [
  EducationFactSchema,
  InternshipFactSchema,
  ProjectFactSchema,
  SkillFactSchema,
]);
export type CandidateFactContent = z.infer<typeof CandidateFactContentSchema>;

export const FactStatusSchema = z.enum(["pending", "confirmed", "rejected"]);
export type FactStatus = z.infer<typeof FactStatusSchema>;
export const FactSourceSchema = z.enum(["manual", "resume"]);
export type FactSource = z.infer<typeof FactSourceSchema>;

export const ProfileFactSchema = z.object({
  id: z.uuid(),
  status: FactStatusSchema,
  source: FactSourceSchema,
  resumeUploadId: z.uuid().nullable(),
  sourceExcerpt: z.string().max(1_000).nullable(),
  content: CandidateFactContentSchema,
  duplicateOfFactId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type ProfileFact = z.infer<typeof ProfileFactSchema>;

export const ResumeFailureCodeSchema = z.enum([
  "resume_parse_failed",
  "resume_text_empty",
  "extraction_failed",
  "extraction_output_invalid",
  "interrupted",
]);
export type ResumeFailureCode = z.infer<typeof ResumeFailureCodeSchema>;

export const ResumeUploadSummarySchema = z.object({
  id: z.uuid(),
  originalFileName: z.string().min(1).max(255),
  kind: z.enum(["pdf", "docx"]),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  isActive: z.boolean(),
  parseStatus: z.enum(["pending", "parsing", "parsed", "failed"]),
  extractionStatus: z.enum(["not_started", "queued", "extracting", "awaiting_confirmation", "completed", "failed"]),
  failureCode: ResumeFailureCodeSchema.nullable(),
  warnings: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ResumeUploadSummary = z.infer<typeof ResumeUploadSummarySchema>;

export const ProfileCompletionSchema = z.object({
  percentage: z.number().int().min(0).max(100),
  completed: z.array(z.string()),
  missing: z.array(z.string()),
});
export type ProfileCompletion = z.infer<typeof ProfileCompletionSchema>;

export const FactGroupsSchema = z.object({
  education: z.array(ProfileFactSchema),
  internship: z.array(ProfileFactSchema),
  project: z.array(ProfileFactSchema),
  skill: z.array(ProfileFactSchema),
}).superRefine((groups, context) => {
  for (const type of ["education", "internship", "project", "skill"] as const) {
    groups[type].forEach((fact, index) => {
      if (fact.content.type !== type) {
        context.addIssue({
          code: "custom",
          path: [type, index, "content", "type"],
          message: "Fact is in the wrong group",
        });
      }
    });
  }
});
export type FactGroups = z.infer<typeof FactGroupsSchema>;

export const OnboardingSnapshotSchema = z.object({
  profile: ProfileDraftSchema.nullable(),
  preferences: JobPreferencesSchema.nullable(),
  completion: ProfileCompletionSchema,
  activeResume: ResumeUploadSummarySchema.nullable(),
  facts: FactGroupsSchema,
  factCounts: z.object({
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
});
export type OnboardingSnapshot = z.infer<typeof OnboardingSnapshotSchema>;

export const FactCreateSchema = z.object({ content: CandidateFactContentSchema });
export type FactCreate = z.infer<typeof FactCreateSchema>;
export const FactUpdateSchema = z.object({ content: CandidateFactContentSchema });
export type FactUpdate = z.infer<typeof FactUpdateSchema>;
export const FactBatchConfirmSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
export type FactBatchConfirm = z.infer<typeof FactBatchConfirmSchema>;
export const ExtractionConsentSchema = z.object({ acknowledgedCloudProcessing: z.literal(true) });
export type ExtractionConsent = z.infer<typeof ExtractionConsentSchema>;
export const OperationAcceptedSchema = z.object({ accepted: z.literal(true) });
export type OperationAccepted = z.infer<typeof OperationAcceptedSchema>;

export const ApiErrorCodeSchema = z.enum([
  "validation_failed",
  "origin_not_allowed",
  "bridge_unauthorized",
  "resume_type_not_allowed",
  "resume_too_large",
  "resume_parse_failed",
  "resume_text_empty",
  "extraction_failed",
  "extraction_output_invalid",
  "fact_not_found",
  "fact_state_conflict",
  "storage_unavailable",
  "profile_required",
  "resume_not_found",
  "resume_state_conflict",
  "file_cleanup_failed",
  "job_not_found",
  "source_unavailable",
  "company_directory_unavailable",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
