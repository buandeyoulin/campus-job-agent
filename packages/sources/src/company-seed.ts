import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  CareerSourceKindSchema,
  SeedCompanyInputSchema,
  VerificationEvidenceSchema,
} from "@campus-job-agent/contracts";

export const SeedCareerSourceSchema = z.object({
  url: z.url().refine((value) => new URL(value).protocol === "https:", "Seed sources must use HTTPS"),
  kind: CareerSourceKindSchema,
  adapter: z.string().trim().min(1).max(100),
  evidence: z.array(VerificationEvidenceSchema).min(1).max(20),
}).strict();

export const SeedCompanyRecordSchema = SeedCompanyInputSchema.extend({
  careerSources: z.array(SeedCareerSourceSchema).min(1).max(20),
});
export const SeedCompanyCollectionSchema = z.object({
  version: z.literal(1),
  companies: z.array(SeedCompanyRecordSchema).length(20),
}).strict().superRefine((value, context) => {
  const domains = value.companies.map((company) => company.officialDomain);
  if (new Set(domains).size !== domains.length) {
    context.addIssue({ code: "custom", path: ["companies"], message: "Seed domains must be unique" });
  }
});

export type SeedCareerSource = z.infer<typeof SeedCareerSourceSchema>;
export type SeedCompanyRecord = z.infer<typeof SeedCompanyRecordSchema>;

export function loadSemiconductorCompanySeed(): SeedCompanyRecord[] {
  const path = new URL("../data/semiconductor-companies.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return SeedCompanyCollectionSchema.parse(parsed).companies;
}
