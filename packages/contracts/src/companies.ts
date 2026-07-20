import { z } from "zod";

const PublicHttpUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}, "Expected a credential-free public HTTP(S) URL");

export const NormalizedDomainSchema = z.string()
  .min(1)
  .max(253)
  .regex(/^(?!www\.)(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "Expected a normalized lower-case hostname");

export const CandidateStatusSchema = z.enum(["pending", "quarantined", "verified", "rejected"]);
export const CompanyStatusSchema = z.enum(["active", "paused", "invalid"]);
export const CompanyOriginSchema = z.enum(["seed", "discovery", "manual"]);
export const CareerSourceKindSchema = z.enum(["ats_api", "json_api", "json_ld", "sitemap", "html", "custom"]);
export type CareerSourceKind = z.infer<typeof CareerSourceKindSchema>;
export const CareerSourceStatusSchema = z.enum(["pending", "active", "backoff", "unavailable"]);
export const EvidenceKindSchema = z.enum([
  "official_domain",
  "identity_match",
  "homepage_link",
  "career_semantics",
  "official_ats_link",
  "redirect_chain",
  "negative_signal",
]);

export const VerificationEvidenceSchema = z.object({
  kind: EvidenceKindSchema,
  url: PublicHttpUrlSchema,
  detail: z.string().trim().min(1).max(500),
}).strict();
const EvidenceListSchema = z.array(VerificationEvidenceSchema).max(20);
const ShortTextListSchema = z.array(z.string().trim().min(1).max(100)).max(50);
const TimestampSchema = z.iso.datetime();

export const CompanySchema = z.object({
  id: z.uuid(),
  canonicalName: z.string().trim().min(1).max(200),
  aliases: ShortTextListSchema,
  officialDomain: NormalizedDomainSchema,
  industries: ShortTextListSchema,
  regions: ShortTextListSchema,
  origin: CompanyOriginSchema,
  status: CompanyStatusSchema,
  verificationScore: z.number().int().min(0).max(100),
  verificationEvidence: EvidenceListSchema,
  verifiedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export type Company = z.infer<typeof CompanySchema>;

export const CompanyCandidateSchema = z.object({
  id: z.uuid(),
  canonicalName: z.string().trim().min(1).max(200),
  normalizedName: z.string().trim().min(1).max(200),
  candidateDomain: NormalizedDomainSchema,
  homepageUrl: PublicHttpUrlSchema,
  origin: CompanyOriginSchema,
  status: CandidateStatusSchema,
  verificationScore: z.number().int().min(0).max(100),
  evidence: EvidenceListSchema,
  failureReason: z.string().max(1_000).nullable(),
  retryCount: z.number().int().nonnegative(),
  nextRetryAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export type CompanyCandidate = z.infer<typeof CompanyCandidateSchema>;

export const CompanyCareerSourceSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  canonicalUrl: PublicHttpUrlSchema,
  kind: CareerSourceKindSchema,
  adapter: z.string().trim().min(1).max(100),
  verificationEvidence: EvidenceListSchema,
  status: CareerSourceStatusSchema,
  healthScore: z.number().int().min(0).max(100),
  lastSuccessAt: TimestampSchema.nullable(),
  lastFailureAt: TimestampSchema.nullable(),
  lastCompleteSyncAt: TimestampSchema.nullable(),
  nextSyncAt: TimestampSchema.nullable(),
  backoffUntil: TimestampSchema.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastError: z.string().max(1_000).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export type CompanyCareerSource = z.infer<typeof CompanyCareerSourceSchema>;

export const CompanyCandidateInputSchema = z.object({
  canonicalName: z.string().trim().min(1).max(200),
  candidateDomain: NormalizedDomainSchema,
  homepageUrl: PublicHttpUrlSchema,
  origin: z.enum(["discovery", "manual"]),
  evidence: EvidenceListSchema,
  verificationScore: z.number().int().min(0).max(100).default(0),
}).strict();
export type CompanyCandidateInput = z.input<typeof CompanyCandidateInputSchema>;

export const SeedCompanyInputSchema = z.object({
  canonicalName: z.string().trim().min(1).max(200),
  aliases: ShortTextListSchema,
  officialDomain: NormalizedDomainSchema,
  industries: ShortTextListSchema,
  regions: ShortTextListSchema,
  verificationEvidence: EvidenceListSchema,
  verificationScore: z.number().int().min(0).max(100).default(100),
}).strict();
export type SeedCompanyInput = z.input<typeof SeedCompanyInputSchema>;

export const PromoteCandidateDecisionSchema = z.object({
  aliases: ShortTextListSchema,
  industries: ShortTextListSchema,
  regions: ShortTextListSchema,
  verificationScore: z.number().int().min(0).max(100),
  verificationEvidence: EvidenceListSchema,
}).strict();
export type PromoteCandidateDecision = z.infer<typeof PromoteCandidateDecisionSchema>;

export const CompanyCareerSourceInputSchema = z.object({
  canonicalUrl: PublicHttpUrlSchema,
  kind: CareerSourceKindSchema,
  adapter: z.string().trim().min(1).max(100),
  verificationEvidence: EvidenceListSchema.default([]),
}).strict();
export type CompanyCareerSourceInput = z.input<typeof CompanyCareerSourceInputSchema>;

const OptionalFilter = z.string().trim().max(200).default("");
const Pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const CompanyListQuerySchema = z.object({
  keyword: OptionalFilter,
  industry: OptionalFilter,
  region: OptionalFilter,
  status: z.union([z.literal(""), CompanyStatusSchema]).default(""),
  ...Pagination,
});
export type CompanyListQuery = z.infer<typeof CompanyListQuerySchema>;
export const CompanyCandidateListQuerySchema = z.object({
  keyword: OptionalFilter,
  industry: OptionalFilter,
  region: OptionalFilter,
  status: z.union([z.literal(""), CandidateStatusSchema]).default(""),
  ...Pagination,
});
export type CompanyCandidateListQuery = z.infer<typeof CompanyCandidateListQuerySchema>;

export const CompanyDirectoryEntrySchema = CompanySchema.extend({
  careerSourceCount: z.number().int().nonnegative(),
  jobCount: z.number().int().nonnegative(),
});
export type CompanyDirectoryEntry = z.infer<typeof CompanyDirectoryEntrySchema>;
export const CompanyListSchema = z.object({
  companies: z.array(CompanyDirectoryEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type CompanyList = z.infer<typeof CompanyListSchema>;
export const CompanyCandidateListSchema = z.object({
  candidates: z.array(CompanyCandidateSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type CompanyCandidateList = z.infer<typeof CompanyCandidateListSchema>;

export const CompanyMutationResultSchema = z.object({ company: CompanySchema, created: z.boolean() });
export const CompanyCandidateMutationResultSchema = z.object({ candidate: CompanyCandidateSchema, created: z.boolean() });
export const CompanyCareerSourceMutationResultSchema = z.object({ source: CompanyCareerSourceSchema, created: z.boolean() });
export type CompanyCareerSourceMutationResult = z.infer<typeof CompanyCareerSourceMutationResultSchema>;
export const CandidateVerificationUpdateSchema = z.object({
  status: z.enum(["quarantined", "rejected"]),
  verificationScore: z.number().int().min(0).max(100),
  evidence: EvidenceListSchema,
  failureReason: z.string().trim().min(1).max(1_000),
  nextRetryAt: TimestampSchema.nullable(),
}).strict();
export type CandidateVerificationUpdate = z.infer<typeof CandidateVerificationUpdateSchema>;
export const CandidateVerificationRunResultSchema = z.object({
  processed: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  completedAt: TimestampSchema,
});
export type CandidateVerificationRunResult = z.infer<typeof CandidateVerificationRunResultSchema>;
export const ManualCompanyRequestSchema = z.object({
  canonicalName: z.string().trim().min(1).max(200),
  homepageUrl: PublicHttpUrlSchema,
}).strict();
export type ManualCompanyRequest = z.infer<typeof ManualCompanyRequestSchema>;
export const ManualCompanyResultSchema = z.object({
  candidate: CompanyCandidateSchema,
  verification: CandidateVerificationRunResultSchema,
});
export type ManualCompanyResult = z.infer<typeof ManualCompanyResultSchema>;
export const ManualCareerSourceRequestSchema = z.object({ canonicalUrl: PublicHttpUrlSchema }).strict();
export type ManualCareerSourceRequest = z.infer<typeof ManualCareerSourceRequestSchema>;
export const CompanyDiscoveryRequestSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
}).strict();
export type CompanyDiscoveryRequest = z.infer<typeof CompanyDiscoveryRequestSchema>;
export const CompanyDiscoveryRunResultSchema = z.object({
  searched: z.number().int().nonnegative(),
  candidatesCreated: z.number().int().nonnegative(),
  candidatesUpdated: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  completedAt: TimestampSchema,
});
export type CompanyDiscoveryRunResult = z.infer<typeof CompanyDiscoveryRunResultSchema>;
export const CompanySeedImportResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  completedAt: TimestampSchema,
});
export type CompanySeedImportResult = z.infer<typeof CompanySeedImportResultSchema>;
export const SourceSyncOutcomeSchema = z.object({
  succeeded: z.boolean(),
  complete: z.boolean().default(false),
  error: z.string().trim().min(1).max(1_000).optional(),
}).strict();
export type SourceSyncOutcome = z.input<typeof SourceSyncOutcomeSchema>;
