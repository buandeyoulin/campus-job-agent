import * as cheerio from "cheerio";
import type { CareerSourceKind } from "@campus-job-agent/contracts";

export interface SourceEvidence {
  kind: "official_domain" | "identity_match" | "homepage_link" | "career_semantics" | "official_ats_link" | "redirect_chain" | "negative_signal";
  url: string;
  detail: string;
}

export interface CareerSourceClassification {
  kind: CareerSourceKind;
  adapter: string;
}

function containsJobPosting(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsJobPosting);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return true;
  return Object.values(record).some(containsJobPosting);
}

export function classifyCareerSource(url: string, html: string, evidence: readonly SourceEvidence[]): CareerSourceClassification {
  new URL(url);
  const $ = cheerio.load(html);
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    try {
      if (containsJobPosting(JSON.parse($(element).text()) as unknown)) return { kind: "json_ld", adapter: "json-ld" };
    } catch {
      // Invalid metadata is ignored; it never upgrades source trust.
    }
  }
  if (evidence.some((item) => item.kind === "official_ats_link")) return { kind: "html", adapter: "external-ats" };
  return { kind: "html", adapter: "unclassified" };
}
