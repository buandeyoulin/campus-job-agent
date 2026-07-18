import { z } from "zod";
import { NormalizedJobSchema } from "./phase0.js";

export const JobStatusSchema = z.enum(["unknown", "active", "expired"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSourceSchema = NormalizedJobSchema.extend({
  sourceCapturedAt: z.iso.datetime().optional(),
});
export type JobSource = z.infer<typeof JobSourceSchema>;

export const StoredJobSchema = NormalizedJobSchema.extend({
  id: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: JobStatusSchema,
  firstCapturedAt: z.iso.datetime(),
  lastCapturedAt: z.iso.datetime(),
  sources: z.array(JobSourceSchema).min(1).max(50),
});
export type StoredJob = z.infer<typeof StoredJobSchema>;

export const JobImportSchema = z.object({
  jobs: z.array(NormalizedJobSchema).min(1).max(100),
});
export type JobImport = z.infer<typeof JobImportSchema>;

const VisibleOfferBiuText = z.string().trim().min(1).max(1_000);
export const OfferBiuVisibleRecordSchema = z.object({
  company: VisibleOfferBiuText,
  roles: VisibleOfferBiuText,
  location: z.string().trim().max(500).default(""),
  industry: z.string().trim().max(300).default(""),
  cohort: z.string().trim().max(100).default(""),
  deadline: z.string().trim().max(100).default(""),
  requirement: z.string().trim().max(300).default(""),
  applyUrl: z.url(),
});
export type OfferBiuVisibleRecord = z.infer<typeof OfferBiuVisibleRecordSchema>;

export const OfferBiuVisibleImportSchema = z.object({
  records: z.array(OfferBiuVisibleRecordSchema).min(1).max(100),
});
export type OfferBiuVisibleImport = z.infer<typeof OfferBiuVisibleImportSchema>;

const BridgeText = z.string().trim().min(1).max(2_000);
const BridgeOptionalText = z.union([z.string().trim().max(2_000), z.null()]).optional();
const BridgeOptionalUrl = z.union([z.url(), z.null()]).optional();
export const OfferBiuBridgeRecordSchema = z.object({
  id: z.string().trim().min(1).max(300),
  companyName: z.string().trim().min(1).max(500),
  companyNature: BridgeOptionalText,
  industry: BridgeOptionalText,
  recruitType: BridgeOptionalText,
  targetYears: z.array(z.number().int().min(2000).max(2100)).max(20).optional(),
  locations: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  positionsText: BridgeText,
  deadlineText: BridgeOptionalText,
  announcementUrl: BridgeOptionalUrl,
  applyUrl: BridgeOptionalUrl,
  examPolicy: BridgeOptionalText,
  noteText: BridgeOptionalText,
  sourceUpdatedAt: z.union([z.iso.datetime(), z.null()]).optional(),
  seasonYear: z.number().int().min(2000).max(2100).optional(),
});
export type OfferBiuBridgeRecord = z.infer<typeof OfferBiuBridgeRecordSchema>;

export const OfferBiuBridgeBatchSchema = z.object({
  syncId: z.uuid(),
  seasonYear: z.number().int().min(2000).max(2100),
  page: z.number().int().min(0).max(9_999),
  totalPages: z.number().int().min(1).max(10_000),
  records: z.array(OfferBiuBridgeRecordSchema).min(1).max(50),
}).refine((value) => value.page < value.totalPages, {
  path: ["page"],
  message: "Page must be lower than totalPages",
});
export type OfferBiuBridgeBatch = z.infer<typeof OfferBiuBridgeBatchSchema>;

export const OfferBiuBridgeSessionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type OfferBiuBridgeSession = z.infer<typeof OfferBiuBridgeSessionSchema>;

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
