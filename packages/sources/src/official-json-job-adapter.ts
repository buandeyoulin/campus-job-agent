import { NormalizedJobSchema, type CompanyCareerSource } from "@campus-job-agent/contracts";
import { fetchBoundedSource, type CareerSourceAdapter, type OfficialJobBatch } from "./career-source-adapter.js";

export interface OfficialJsonMapping {
  items: string; id: string; title: string; location?: string; description: string; url: string; postedAt?: string;
  completeness: "complete" | "partial";
}
export interface OfficialJsonJobAdapterOptions { fetcher?: typeof fetch; configurations: Readonly<Record<string, OfficialJsonMapping>> }

function pathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

export class OfficialJsonJobAdapter implements CareerSourceAdapter {
  readonly id = "official-json";
  constructor(private readonly options: OfficialJsonJobAdapterOptions) {}
  supports(source: CompanyCareerSource): boolean { return (source.kind === "json_api" || source.kind === "ats_api") && Boolean(this.options.configurations[source.adapter]); }

  async fetch(source: CompanyCareerSource, context: Parameters<CareerSourceAdapter["fetch"]>[1]): Promise<OfficialJobBatch> {
    const mapping = this.options.configurations[source.adapter];
    if (!mapping) throw new Error("No explicit JSON mapping for career source");
    const response = await fetchBoundedSource(source.canonicalUrl, this.options.fetcher ?? fetch, "application/json");
    let payload: unknown;
    try { payload = JSON.parse(response.text) as unknown; } catch { throw new Error("Official JSON source returned malformed JSON"); }
    const items = pathValue(payload, mapping.items);
    if (!Array.isArray(items)) throw new Error("Official JSON items path is not an array");
    const jobs = items.slice(0, 500).flatMap((item) => {
      const id = pathValue(item, mapping.id); const title = pathValue(item, mapping.title);
      const description = pathValue(item, mapping.description); const url = pathValue(item, mapping.url);
      if ((typeof id !== "string" && typeof id !== "number") || typeof title !== "string" || typeof description !== "string" || typeof url !== "string") return [];
      const postedValue = mapping.postedAt ? pathValue(item, mapping.postedAt) : undefined;
      const posted = typeof postedValue === "string" ? new Date(postedValue) : null;
      const candidate = NormalizedJobSchema.safeParse({
        source: "official-company", sourceJobId: String(id), sourceUrl: new URL(url, response.finalUrl).toString(), title,
        company: context.company.canonicalName, location: String(mapping.location ? pathValue(item, mapping.location) ?? "" : ""),
        description, capturedAt: context.capturedAt,
        ...(posted && !Number.isNaN(posted.valueOf()) ? { postedAt: posted.toISOString() } : {}),
      });
      return candidate.success ? [candidate.data] : [];
    });
    return { completeness: items.length > 500 ? "partial" : mapping.completeness, jobs, sourceCheckedAt: context.capturedAt };
  }
}
