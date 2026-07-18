import { z } from "zod";
import { NormalizedJobSchema } from "./phase0.js";

export const JobStatusSchema = z.enum(["unknown", "active", "expired"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobLifecycleStatusSchema = z.enum(["active", "possibly_expired", "closed"]);
export type JobLifecycleStatus = z.infer<typeof JobLifecycleStatusSchema>;

export const JobSourceSchema = NormalizedJobSchema.extend({
  sourceCapturedAt: z.iso.datetime().optional(),
  companyId: z.uuid().nullable().default(null),
  careerSourceId: z.uuid().nullable().default(null),
  lastSeenAt: z.iso.datetime().nullable().default(null),
  missingCompleteScans: z.number().int().nonnegative().default(0),
});
export type JobSource = z.infer<typeof JobSourceSchema>;

export const StoredJobSchema = NormalizedJobSchema.extend({
  id: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: JobStatusSchema,
  lifecycleStatus: JobLifecycleStatusSchema.default("active"),
  firstCapturedAt: z.iso.datetime(),
  lastCapturedAt: z.iso.datetime(),
  sources: z.array(JobSourceSchema).min(1).max(50),
});
export type StoredJob = z.infer<typeof StoredJobSchema>;

export const JobImportSchema = z.object({
  jobs: z.array(NormalizedJobSchema).min(1).max(100),
});
export type JobImport = z.infer<typeof JobImportSchema>;

const OptionalFilter = z.string().trim().max(100).default("");
export const JobListQuerySchema = z.object({
  keyword: OptionalFilter,
  city: OptionalFilter,
  source: OptionalFilter,
  status: z.union([JobStatusSchema, z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type JobListQuery = z.infer<typeof JobListQuerySchema>;

export const JobListSchema = z.object({
  jobs: z.array(StoredJobSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type JobList = z.infer<typeof JobListSchema>;

export const ScanResultSchema = z.object({
  source: z.string().min(1),
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const SourceStatusSchema = z.object({
  source: z.string().min(1),
  available: z.boolean(),
  message: z.string().min(1).max(300),
  lastCheckedAt: z.iso.datetime().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const OfficialJobSyncRequestSchema = z.object({ companyId: z.uuid().optional() }).strict();
export type OfficialJobSyncRequest = z.infer<typeof OfficialJobSyncRequestSchema>;
export const OfficialJobSyncResultSchema = z.object({
  sourcesSelected: z.number().int().nonnegative(),
  sourcesSucceeded: z.number().int().nonnegative(),
  sourcesSkipped: z.number().int().nonnegative(),
  sourcesFailed: z.number().int().nonnegative(),
  jobsFetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type OfficialJobSyncResult = z.infer<typeof OfficialJobSyncResultSchema>;
