import type { CompanyDirectoryEntryInput, ProbeResult } from "@campus-job-agent/contracts";
import { chromium } from "playwright";

export const OFFERBIU_COMPANIES_URL = "https://offerbiu.com/companies/";

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
