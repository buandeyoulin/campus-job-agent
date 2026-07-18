import { z } from "zod";
import type { CompanyDiscoveryProvider, CompanyDiscoveryResult } from "./company-discovery.js";

const BraveResponseSchema = z.object({
  web: z.object({
    results: z.array(z.object({
      title: z.string().max(500),
      url: z.url(),
      description: z.string().max(5_000).default(""),
    }).strip()).max(20),
  }).optional(),
}).strip();

export class CompanyDiscoveryError extends Error {
  constructor(
    public readonly code: "rate_limited" | "unavailable",
    message: string,
    public readonly retryAt: string | null = null,
  ) {
    super(message);
    this.name = "CompanyDiscoveryError";
  }
}

export interface BraveCompanyDiscoveryOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class BraveCompanyDiscovery implements CompanyDiscoveryProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = 0;

  constructor(options: BraveCompanyDiscoveryOptions) {
    if (!options.apiKey.trim()) throw new Error("A Brave Search API key is required");
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
  }

  async discover(queries: readonly string[]): Promise<CompanyDiscoveryResult[]> {
    const boundedQueries = queries.map((query) => query.trim()).filter(Boolean).slice(0, 10);
    const output: CompanyDiscoveryResult[] = [];
    for (const query of boundedQueries) {
      for (let page = 0; page < 2; page += 1) {
        const results = await this.search(query, page);
        output.push(...results.map((item) => ({ query, ...item })));
        if (results.length < 20) break;
      }
    }
    return output;
  }

  private async search(query: string, page: number): Promise<Array<Omit<CompanyDiscoveryResult, "query">>> {
    const elapsed = this.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < 1_000) await this.wait(1_000 - elapsed);
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("country", "CN");
    url.searchParams.set("search_lang", "zh-hans");
    url.searchParams.set("offset", String(page));
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      });
      this.lastRequestAt = this.now();
      if (response.status === 429) {
        const raw = Number(response.headers.get("X-RateLimit-Reset") ?? 0);
        const retryMs = raw > 1_000_000_000 ? raw * 1_000 : this.now() + Math.max(0, raw) * 1_000;
        throw new CompanyDiscoveryError("rate_limited", "Company discovery is rate limited", new Date(retryMs).toISOString());
      }
      if (!response.ok) throw new CompanyDiscoveryError("unavailable", "Company discovery is unavailable");
      const parsed = BraveResponseSchema.parse(await response.json());
      return (parsed.web?.results ?? []).map((item) => ({ title: item.title, url: item.url, snippet: item.description }));
    } catch (error) {
      if (error instanceof CompanyDiscoveryError) throw error;
      throw new CompanyDiscoveryError("unavailable", "Company discovery is unavailable");
    }
  }
}
