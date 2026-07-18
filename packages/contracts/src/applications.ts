import { z } from "zod";
import { StoredJobSchema } from "./jobs.js";

export const ApplicationStatusSchema = z.enum([
  "saved", "preparing", "applied", "assessment", "interview", "offer", "rejected", "withdrawn", "expired",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationCreateSchema = z.object({ jobId: z.uuid() });
export type ApplicationCreate = z.infer<typeof ApplicationCreateSchema>;

export const ApplicationUpdateSchema = z.object({
  status: ApplicationStatusSchema,
  note: z.string().trim().max(2_000).default(""),
});
export type ApplicationUpdate = z.infer<typeof ApplicationUpdateSchema>;

export const ApplicationSchema = z.object({ id: z.uuid(), jobId: z.uuid(), status: ApplicationStatusSchema, note: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type Application = z.infer<typeof ApplicationSchema>;
export const ApplicationEventSchema = z.object({ id: z.uuid(), applicationId: z.uuid(), status: ApplicationStatusSchema, note: z.string(), createdAt: z.iso.datetime() });
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

const ShortListSchema = z.array(z.string().trim().min(1).max(500)).max(20);
export const AiJobAssessmentSchema = z.object({
  jobId: z.uuid(),
  fitScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(1_000),
  strengths: ShortListSchema,
  gaps: ShortListSchema,
}).strict();
export type AiJobAssessment = z.infer<typeof AiJobAssessmentSchema>;
export const AiJobAssessmentListSchema = z.array(AiJobAssessmentSchema).max(20);

export const JobMatchSchema = z.object({
  job: StoredJobSchema,
  eligible: z.boolean(),
  score: z.number().int().min(0).max(100),
  reasons: ShortListSchema,
  evidence: ShortListSchema,
  aiAssessment: AiJobAssessmentSchema.nullable(),
});
export type JobMatchResult = z.infer<typeof JobMatchSchema>;
export const JobMatchListSchema = z.array(JobMatchSchema);

export const InterviewQuestionSchema = z.object({
  question: z.string().trim().min(1).max(1_000),
  answerOutline: z.string().trim().min(1).max(3_000),
  evidence: ShortListSchema,
}).strict();
export const ApplicationPreparationContentSchema = z.object({
  tailoredResumeMarkdown: z.string().trim().min(1).max(50_000),
  interviewQuestions: z.array(InterviewQuestionSchema).min(3).max(20),
  gaps: ShortListSchema,
}).strict();
export type ApplicationPreparationContent = z.infer<typeof ApplicationPreparationContentSchema>;
export const ApplicationPreparationSchema = ApplicationPreparationContentSchema.extend({
  id: z.uuid(), applicationId: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type ApplicationPreparation = z.infer<typeof ApplicationPreparationSchema>;
export const ApplicationDetailSchema = z.object({
  application: ApplicationSchema,
  job: StoredJobSchema,
  events: z.array(ApplicationEventSchema),
  preparation: ApplicationPreparationSchema.nullable(),
});
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;
export const ApplicationListSchema = z.array(ApplicationDetailSchema);
