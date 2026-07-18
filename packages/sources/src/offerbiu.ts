import { NormalizedJobSchema, type CompanyDirectoryEntryInput, type NormalizedJob, type ProbeResult } from "@campus-job-agent/contracts";
import { chromium } from "playwright";

export const OFFERBIU_COMPANIES_URL = "https://offerbiu.com/companies/";
export const OFFERBIU_POSTINGS_URL = "https://offerbiu.com/api/recruitment/postings";
const OFFERBIU_PAGE_SIZE = 50;

export interface OfferBiuPosting {
  id?: unknown;
  companyName?: unknown;
  companyNature?: unknown;
  industry?: unknown;
  recruitType?: unknown;
  targetYears?: unknown;
  locations?: unknown;
  positionsText?: unknown;
  deadlineText?: unknown;
  announcementUrl?: unknown;
  applyUrl?: unknown;
  examPolicy?: unknown;
  noteText?: unknown;
  sourceUpdatedAt?: unknown;
}

interface OfferBiuPage {
  items: OfferBiuPosting[];
  page: number;
  totalPages: number;
  previewLimited: boolean;
}

export interface FetchOfferBiuJobsOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  concurrency?: number;
  seasons?: readonly number[];
  browserSessionFactory?: () => Promise<OfferBiuBrowserSession>;
  requestDelayMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface OfferBiuBrowserSession {
  fetcher: typeof fetch;
  close(): Promise<void>;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

function externalUrl(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mapOfferBiuPosting(posting: OfferBiuPosting, capturedAt: string): NormalizedJob | null {
  const sourceJobId = textValue(posting.id);
  const company = textValue(posting.companyName);
  const title = textValue(posting.positionsText);
  const sourceUrl = externalUrl(posting.applyUrl) ?? externalUrl(posting.announcementUrl);
  if (!sourceJobId || !company || !title || !sourceUrl) return null;

  const targetYears = Array.isArray(posting.targetYears)
    ? posting.targetYears.filter((year): year is number => Number.isInteger(year)).join("、")
    : "";
  const description = [
    textValue(posting.industry) && `行业：${textValue(posting.industry)}`,
    textValue(posting.companyNature) && `企业性质：${textValue(posting.companyNature)}`,
    textValue(posting.recruitType) && `招聘类型：${textValue(posting.recruitType)}`,
    targetYears && `面向届别：${targetYears}`,
    textValue(posting.deadlineText) && `截止时间：${textValue(posting.deadlineText)}`,
    textValue(posting.examPolicy) && `笔试：${textValue(posting.examPolicy)}`,
    textValue(posting.noteText),
    externalUrl(posting.announcementUrl) && `招聘公告：${externalUrl(posting.announcementUrl)}`,
  ].filter(Boolean).join("\n") || "OfferBiu 校招信息";

  return NormalizedJobSchema.parse({
    source: "offerbiu",
    sourceJobId,
    sourceUrl,
    title,
    company,
    location: stringList(posting.locations).join("、"),
    description,
    capturedAt,
  });
}

async function fetchOfferBiuPage(fetcher: typeof fetch, seasonYear: number, page: number): Promise<OfferBiuPage> {
  const url = new URL(OFFERBIU_POSTINGS_URL);
  url.searchParams.set("seasonYear", String(seasonYear));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(OFFERBIU_PAGE_SIZE));
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`OfferBiu request failed with HTTP ${response.status}`);
  const payload = await response.json() as {
    success?: unknown;
    data?: { items?: unknown; page?: unknown; totalPages?: unknown; previewLimited?: unknown };
  };
  const data = payload.data;
  if (payload.success !== true || !data || !Array.isArray(data.items)
    || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages) || Number(data.totalPages) < 1) {
    throw new Error("OfferBiu returned an invalid recruitment response");
  }
  return {
    items: data.items as OfferBiuPosting[],
    page: Number(data.page),
    totalPages: Number(data.totalPages),
    previewLimited: data.previewLimited === true,
  };
}

async function createOfferBiuBrowserSession(): Promise<OfferBiuBrowserSession> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(new URL("/robots.txt", OFFERBIU_COMPANIES_URL).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const accept = new Headers(init?.headers).get("accept") ?? "application/json";
      const result = await page.evaluate(async ({ requestUrl, acceptHeader }) => {
        const response = await fetch(requestUrl, { headers: { accept: acceptHeader } });
        return {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type") ?? "application/json",
          body: await response.text(),
        };
      }, { requestUrl: url, acceptHeader: accept });
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: { "content-type": result.contentType },
      });
    };
    return { fetcher: fetcher as typeof fetch, close: () => browser.close() };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function fetchRemainingPages(
  fetcher: typeof fetch,
  seasonYear: number,
  totalPages: number,
  concurrency: number,
): Promise<OfferBiuPosting[]> {
  const items: OfferBiuPosting[] = [];
  for (let start = 1; start < totalPages; start += concurrency) {
    const pages = Array.from({ length: Math.min(concurrency, totalPages - start) }, (_, index) => start + index);
    const results = await Promise.all(pages.map((page) => fetchOfferBiuPage(fetcher, seasonYear, page)));
    for (const result of results) items.push(...result.items);
  }
  return items;
}

/** Reads every currently exposed OfferBiu recruitment record without logging in or submitting applications. */
export async function fetchOfferBiuJobs(options: FetchOfferBiuJobsOptions = {}): Promise<NormalizedJob[]> {
  const session = options.fetcher
    ? undefined
    : await (options.browserSessionFactory ?? createOfferBiuBrowserSession)();
  const rawFetcher = options.fetcher ?? session!.fetcher;
  const requestDelayMs = Math.max(0, Math.trunc(options.requestDelayMs ?? (session ? 3_000 : 0)));
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let firstRequest = true;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!firstRequest && requestDelayMs > 0) await wait(requestDelayMs);
    firstRequest = false;
    return rawFetcher(input, init);
  }) as typeof fetch;
  const capturedAt = (options.now ?? (() => new Date()))().toISOString();
  const concurrency = session ? 1 : Math.max(1, Math.min(8, Math.trunc(options.concurrency ?? 4)));
  const jobs: NormalizedJob[] = [];
  try {
    for (const seasonYear of options.seasons ?? [2027, 2026]) {
      const first = await fetchOfferBiuPage(fetcher, seasonYear, 0);
      const accessiblePages = first.previewLimited ? Math.min(first.totalPages, 2) : first.totalPages;
      const postings = [
        ...first.items,
        ...await fetchRemainingPages(fetcher, seasonYear, accessiblePages, concurrency),
      ];
      for (const posting of postings) {
        const job = mapOfferBiuPosting(posting, capturedAt);
        if (job) jobs.push(job);
      }
    }
    return jobs;
  } finally {
    await session?.close();
  }
}

export interface OfferBiuDirectoryLink {
  companyName: string;
  href: string;
  directoryUrl?: string;
  label?: string;
}

function metric(text: string, label: string): number {
  const match = text.replace(/\s+/g, " ").match(new RegExp(`${label}\\s*(\\d+)`));
  return match?.[1] ? Number(match[1]) : 0;
}

function isOfferBiuUrl(url: URL): boolean {
  return url.hostname === "offerbiu.com" || url.hostname.endsWith(".offerbiu.com");
}

function isLikelyCareerUrl(url: URL): boolean {
  return !/\/(login|signin|sign-in|register|signup)(?:\/|$)/i.test(url.pathname);
}

function hasCareerSignal(link: OfferBiuDirectoryLink, url: URL): boolean {
  return /(?:career|job|jobs|recruit|campus|hiring|position)/i.test(`${url.hostname}${url.pathname}`)
    || /(?:招聘|校招|社招|职位|岗位|career|job|join us)/i.test(link.label ?? "");
}

function isCompanyDetailPage(url: URL): boolean {
  return /^\/(company|companies)\/[^/?#]+\/?$/i.test(url.pathname);
}

/** Identifies public OfferBiu company detail pages; it never treats them as final career URLs. */
export function extractOfferBiuCompanyPages(links: readonly OfferBiuDirectoryLink[]): OfferBiuDirectoryLink[] {
  const pages = new Map<string, OfferBiuDirectoryLink>();
  for (const link of links) {
    const companyName = link.companyName.trim().replace(/\s+/g, " ");
    if (!companyName) continue;
    try {
      const url = new URL(link.href);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || !isOfferBiuUrl(url) || !isCompanyDetailPage(url)) continue;
      url.hash = "";
      pages.set(url.toString(), { companyName, href: url.toString() });
    } catch {
      continue;
    }
  }
  return [...pages.values()];
}

/**
 * Converts only visible, explicit external links from OfferBiu into local directory entries.
 * It deliberately does not infer a company's recruiting URL from its name or website.
 */
export function extractOfferBiuCompanyEntries(links: readonly OfferBiuDirectoryLink[]): CompanyDirectoryEntryInput[] {
  const entries = new Map<string, CompanyDirectoryEntryInput>();
  for (const link of links) {
    const companyName = link.companyName.trim().replace(/\s+/g, " ");
    if (!companyName) continue;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || isOfferBiuUrl(url) || !isLikelyCareerUrl(url) || !hasCareerSignal(link, url)) continue;
    url.hash = "";
    const careerUrl = url.toString();
    const key = `${companyName.toLocaleLowerCase()}\u0000${careerUrl}`;
    if (!entries.has(key)) {
      entries.set(key, {
        companyName,
        careerUrl,
        directorySource: "offerbiu",
        directoryUrl: link.directoryUrl ?? OFFERBIU_COMPANIES_URL,
      });
    }
  }
  return [...entries.values()];
}

/** Reads a public directory page only; it does not log in or follow protected job pages. */
export async function fetchOfferBiuCompanyDirectory(): Promise<CompanyDirectoryEntryInput[]> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(OFFERBIU_COMPANIES_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const directoryLinks = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => {
      const element = anchor as HTMLAnchorElement;
      const cardText = element.closest("article, li, [class*='card'], [class*='company']")?.textContent ?? "";
      return { companyName: element.textContent?.trim() || cardText.trim(), href: element.href };
    }));
    const companyPages = extractOfferBiuCompanyPages(directoryLinks).slice(0, 200);
    const detailEntries: CompanyDirectoryEntryInput[] = [];
    for (const company of companyPages) {
      await page.goto(company.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        label: anchor.textContent?.trim() ?? "",
      })));
      detailEntries.push(...extractOfferBiuCompanyEntries(links.map((link) => ({
        companyName: company.companyName,
        href: link.href,
        directoryUrl: company.href,
        label: link.label,
      }))));
    }
    const entries = new Map<string, CompanyDirectoryEntryInput>();
    for (const entry of detailEntries) entries.set(`${entry.companyName}\u0000${entry.careerUrl}`, entry);
    return [...entries.values()];
  } finally {
    await browser?.close();
  }
}

export function classifyOfferBiuMetrics(text: string, checkedAt: string): ProbeResult {
  const companyCount = metric(text, "已收录公司");
  const publicJobCount = metric(text, "校招信息");
  const availableCount = metric(text, "可投岗位");
  const supported = publicJobCount > 0 && availableCount > 0;
  return {
    name: "offerbiu",
    status: supported ? "pass" : "fail",
    summary: supported ? "OfferBiu exposes public job records" : "OfferBiu public page exposes no usable job records",
    details: { companyCount, publicJobCount, availableCount },
    checkedAt,
  };
}

/** Retained for the phase-0 evidence script; directory scanning uses fetchOfferBiuCompanyDirectory. */
export async function probeOfferBiu(now: () => Date = () => new Date()): Promise<ProbeResult> {
  const checkedAt = now().toISOString();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(OFFERBIU_COMPANIES_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return classifyOfferBiuMetrics(await page.locator("body").innerText(), checkedAt);
  } catch {
    return { name: "offerbiu", status: "fail", summary: "OfferBiu public page could not be inspected", details: {}, checkedAt };
  } finally {
    await browser?.close();
  }
}
