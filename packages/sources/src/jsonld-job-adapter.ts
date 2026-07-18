import * as cheerio from "cheerio";
import { z } from "zod";
import { NormalizedJobSchema, type CompanyCareerSource } from "@campus-job-agent/contracts";
import { fetchBoundedSource, type CareerSourceAdapter, type OfficialJobBatch } from "./career-source-adapter.js";

const JobPostingSchema = z.object({
  "@type": z.union([z.literal("JobPosting"), z.array(z.string()).refine((items) => items.includes("JobPosting"))]),
  identifier: z.union([z.string(), z.object({ value: z.union([z.string(), z.number()]) }).passthrough()]).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.url(),
  datePosted: z.string().optional(),
  jobLocation: z.unknown().optional(),
}).passthrough();

function collect(value: unknown, output: unknown[]): void {
  if (Array.isArray(value)) { value.forEach((item) => collect(item, output)); return; }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) output.push(record);
  if (record["@graph"]) collect(record["@graph"], output);
}

function location(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return "";
  const address = (first as Record<string, unknown>).address;
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  return [record.addressLocality, record.addressRegion, record.addressCountry].filter((item): item is string => typeof item === "string").join(", ");
}

function plainText(html: string): string {
  return cheerio.load(`<body>${html}</body>`)("body").text().replace(/\s+/g, " ").trim();
}

export class JsonLdJobAdapter implements CareerSourceAdapter {
  readonly id = "json-ld";
  constructor(private readonly options: { fetcher?: typeof fetch } = {}) {}
  supports(source: CompanyCareerSource): boolean { return source.kind === "json_ld" || source.adapter === this.id; }

  async fetch(source: CompanyCareerSource, context: Parameters<CareerSourceAdapter["fetch"]>[1]): Promise<OfficialJobBatch> {
    const page = await fetchBoundedSource(source.canonicalUrl, this.options.fetcher ?? fetch, "text/html,application/xhtml+xml");
    const $ = cheerio.load(page.text);
    const values: unknown[] = [];
    $('script[type="application/ld+json"]').each((_index, element) => {
      try { collect(JSON.parse($(element).text()) as unknown, values); } catch { /* malformed blocks are skipped */ }
    });
    const jobs = values.flatMap((value) => {
      const parsed = JobPostingSchema.safeParse(value);
      if (!parsed.success) return [];
      const identifier = typeof parsed.data.identifier === "string" ? parsed.data.identifier : parsed.data.identifier?.value;
      const posted = parsed.data.datePosted ? new Date(parsed.data.datePosted) : null;
      const candidate = {
        source: "official-company", sourceJobId: String(identifier ?? parsed.data.url), sourceUrl: parsed.data.url,
        title: parsed.data.title, company: context.company.canonicalName, location: location(parsed.data.jobLocation),
        description: plainText(parsed.data.description), capturedAt: context.capturedAt,
        ...(posted && !Number.isNaN(posted.valueOf()) ? { postedAt: posted.toISOString() } : {}),
      };
      const normalized = NormalizedJobSchema.safeParse(candidate);
      return normalized.success ? [normalized.data] : [];
    });
    return { completeness: "complete", jobs, sourceCheckedAt: context.capturedAt };
  }
}
