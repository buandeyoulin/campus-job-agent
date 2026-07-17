import { z } from "zod";

const PublicHttpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Expected a public HTTP(S) URL");

export const CompanyDirectoryEntryInputSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  careerUrl: PublicHttpUrlSchema,
  directorySource: z.string().trim().min(1).max(100),
  directoryUrl: PublicHttpUrlSchema,
});
export type CompanyDirectoryEntryInput = z.infer<typeof CompanyDirectoryEntryInputSchema>;

export const CompanyCareerSiteStatusSchema = z.enum(["pending", "active", "unavailable"]);
export type CompanyCareerSiteStatus = z.infer<typeof CompanyCareerSiteStatusSchema>;

export const StoredCompanyDirectoryEntrySchema = CompanyDirectoryEntryInputSchema.extend({
  id: z.uuid(),
  status: CompanyCareerSiteStatusSchema,
  firstDiscoveredAt: z.iso.datetime(),
  lastDiscoveredAt: z.iso.datetime(),
});
export type StoredCompanyDirectoryEntry = z.infer<typeof StoredCompanyDirectoryEntrySchema>;

const OptionalKeyword = z.string().trim().max(200).default("");
export const CompanyDirectoryListQuerySchema = z.object({
  keyword: OptionalKeyword,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CompanyDirectoryListQuery = z.infer<typeof CompanyDirectoryListQuerySchema>;

export const CompanyDirectoryListSchema = z.object({
  entries: z.array(StoredCompanyDirectoryEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type CompanyDirectoryList = z.infer<typeof CompanyDirectoryListSchema>;

export const CompanyDirectoryScanResultSchema = z.object({
  source: z.string().min(1),
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type CompanyDirectoryScanResult = z.infer<typeof CompanyDirectoryScanResultSchema>;
