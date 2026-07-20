import * as cheerio from "cheerio";
import { NormalizedJobSchema, type CompanyCareerSource } from "@campus-job-agent/contracts";
import { fetchBoundedSource, type CareerSourceAdapter, type OfficialJobBatch } from "./career-source-adapter.js";

export interface HtmlCareerSelectors {
  listItem: string;
  title: string;
  link?: string;
  location?: string;
  description?: string;
  paginationComplete: boolean;
}
export interface HtmlCareerJobAdapterOptions { fetcher?: typeof fetch; configurations: Readonly<Record<string, HtmlCareerSelectors>> }

export const BUILT_IN_HTML_CAREER_CONFIGURATIONS: Readonly<Record<string, HtmlCareerSelectors>> = {
  "s2c-careers": { listItem: ".t_f4k2li", title: ".t_f4k2name", location: ".t_f4k2ci", description: ".t_f4k2lixia", paginationComplete: true },
  "empyrean-careers": { listItem: ".joblist li", title: ".d1 em", location: ".d2 i", paginationComplete: false },
};

function sameDomain(a: URL, b: URL): boolean { return a.hostname === b.hostname || a.hostname.endsWith(`.${b.hostname}`) || b.hostname.endsWith(`.${a.hostname}`); }

export class HtmlCareerJobAdapter implements CareerSourceAdapter {
  readonly id = "static-html";
  constructor(private readonly options: HtmlCareerJobAdapterOptions) {}
  supports(source: CompanyCareerSource): boolean { return source.kind === "html" && Boolean(this.options.configurations[source.adapter]); }

  async fetch(source: CompanyCareerSource, context: Parameters<CareerSourceAdapter["fetch"]>[1]): Promise<OfficialJobBatch> {
    const config = this.options.configurations[source.adapter];
    if (!config) throw new Error("No static selector configuration for career source");
    const page = await fetchBoundedSource(source.canonicalUrl, this.options.fetcher ?? fetch, "text/html,application/xhtml+xml");
    const $ = cheerio.load(page.text);
    const base = new URL(page.finalUrl);
    const externalAllowed = source.verificationEvidence.some((item) => item.kind === "official_ats_link");
    const jobs = $(config.listItem).toArray().slice(0, 500).flatMap((element) => {
      const item = $(element);
      const href = config.link ? item.find(config.link).first().attr("href") : undefined;
      const title = item.find(config.title).first().text().replace(/\s+/g, " ").trim();
      if (!title) return [];
      let url: URL;
      try {
        url = href && !href.toLocaleLowerCase().startsWith("javascript:")
          ? new URL(href, base)
          : new URL(`#job-${encodeURIComponent(title)}`, base);
      } catch { return []; }
      if (url.protocol !== "https:" || (!sameDomain(url, base) && !externalAllowed)) return [];
      const description = config.description ? item.find(config.description).first().text().replace(/\s+/g, " ").trim() : title;
      const candidate = NormalizedJobSchema.safeParse({
        source: "official-company", sourceJobId: url.toString(), sourceUrl: url.toString(), title,
        company: context.company.canonicalName,
        location: config.location ? item.find(config.location).first().text().replace(/\s+/g, " ").trim() : "",
        description: description || title, capturedAt: context.capturedAt,
      });
      return candidate.success ? [candidate.data] : [];
    });
    const complete = config.paginationComplete && $(config.listItem).length <= 500;
    return { completeness: complete ? "complete" : "partial", jobs, sourceCheckedAt: context.capturedAt };
  }
}
