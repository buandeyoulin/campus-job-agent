import * as cheerio from "cheerio";
import type { CompanyCandidate } from "@campus-job-agent/contracts";
import { classifyCareerSource, type SourceEvidence } from "./career-source-classifier.js";

const MAX_BYTES = 2 * 1024 * 1024;
const AGGREGATE_HOST = /(^|\.)(51job|zhaopin|liepin|zhipin|lagou)\.com$/i;
const PERSONAL_HOST = /(^|\.)(github|weibo|zhihu|linkedin)\.com$/i;
const CAREER_TEXT = /招聘|职位|岗位|加入我们|人才|校园招聘|社会招聘|career|careers|jobs?|join us|open positions?/i;
const CAREER_LINK = /career|careers|jobs?|join|recruit|talent|招聘|职位|加入/i;

export interface VerificationCareerSource {
  url: string;
  kind: "ats_api" | "json_api" | "json_ld" | "sitemap" | "html" | "custom";
  adapter: string;
  evidence: SourceEvidence[];
}

export interface VerificationDecision {
  status: "verified" | "quarantined" | "rejected";
  score: number;
  canonicalName: string;
  officialDomain: string;
  evidence: SourceEvidence[];
  failureReason: string | null;
  careerSources: VerificationCareerSource[];
}

export interface CompanyVerifierOptions {
  fetcher?: typeof fetch;
  proposedCareerUrls?: string[];
  aliases?: string[];
}

async function boundedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Response exceeds 2 MiB limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Response exceeds 2 MiB limit");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

async function fetchHtml(url: string, fetcher: typeof fetch): Promise<{ html: string; finalUrl: string; redirects: number }> {
  let current = new URL(url);
  if (current.protocol !== "https:" || current.username || current.password) throw new Error("Only credential-free HTTPS URLs are allowed");
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetcher(current, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { accept: "text/html,application/xhtml+xml" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Redirect limit exceeded");
      current = new URL(location, current);
      if (current.protocol !== "https:") throw new Error("Redirect left HTTPS");
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xhtml/i.test(contentType)) throw new Error("Expected HTML response");
    return { html: await boundedText(response), finalUrl: response.url || current.toString(), redirects };
  }
  throw new Error("Redirect limit exceeded");
}

function comparable(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function pageIdentityMatches(html: string, names: readonly string[]): boolean {
  const $ = cheerio.load(html);
  const haystack = comparable(`${$("title").text()} ${$('meta[property="og:site_name"]').attr("content") ?? ""} ${$("body").text().slice(0, 20_000)}`);
  return names.some((name) => comparable(name).length >= 2 && haystack.includes(comparable(name)));
}

function extractCareerLinks(homepageUrl: string, html: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    const label = `${$(element).text()} ${href ?? ""}`;
    if (!href || !CAREER_LINK.test(label)) return;
    try {
      const url = new URL(href, homepageUrl);
      if (url.protocol === "https:") links.push(url.toString());
    } catch {
      // Invalid navigation is ignored.
    }
  });
  return [...new Set(links)].slice(0, 2);
}

function hardNegative(candidate: CompanyCandidate): string | null {
  const url = new URL(candidate.homepageUrl);
  if (url.protocol !== "https:" || url.username || url.password) return "invalid homepage URL";
  if (AGGREGATE_HOST.test(url.hostname) || AGGREGATE_HOST.test(candidate.candidateDomain)) return "aggregate recruitment site";
  if (PERSONAL_HOST.test(url.hostname)) return "personal or social profile";
  if (/\/(login|signin|auth)(?:[/?#]|$)/i.test(url.pathname)) return "credential-only page";
  return null;
}

function decisionStatus(score: number): VerificationDecision["status"] {
  if (score >= 80) return "verified";
  if (score >= 40) return "quarantined";
  return "rejected";
}

export async function verifyCompanyCandidate(candidate: CompanyCandidate, options: CompanyVerifierOptions = {}): Promise<VerificationDecision> {
  const negative = hardNegative(candidate);
  if (negative) return { status: "rejected", score: 0, canonicalName: candidate.canonicalName, officialDomain: candidate.candidateDomain, evidence: [{ kind: "negative_signal", url: candidate.homepageUrl, detail: negative }], failureReason: negative, careerSources: [] };

  const fetcher = options.fetcher ?? fetch;
  const evidence: SourceEvidence[] = [];
  const careerSources: VerificationCareerSource[] = [];
  let score = 0;
  try {
    const homepage = await fetchHtml(candidate.homepageUrl, fetcher);
    const finalHome = new URL(homepage.finalUrl);
    if (!hostnameMatches(finalHome.hostname, candidate.candidateDomain)) throw new Error("homepage resolves outside proposed official domain");
    score += 35;
    evidence.push({ kind: "official_domain", url: homepage.finalUrl, detail: "HTTPS homepage resolved on the proposed official domain" });

    if (!pageIdentityMatches(homepage.html, [candidate.canonicalName, ...(options.aliases ?? [])])) {
      return { status: "rejected", score: 0, canonicalName: candidate.canonicalName, officialDomain: candidate.candidateDomain, evidence: [...evidence, { kind: "negative_signal", url: homepage.finalUrl, detail: "conflicting or missing company identity" }], failureReason: "conflicting company identity", careerSources: [] };
    }
    score += 25;
    evidence.push({ kind: "identity_match", url: homepage.finalUrl, detail: "Company name matches page identity metadata" });
    score += 5;
    evidence.push({ kind: "redirect_chain", url: homepage.finalUrl, detail: `HTTPS redirect chain remained on the official domain (${homepage.redirects} redirects)` });

    const linked = extractCareerLinks(homepage.finalUrl, homepage.html);
    const proposed = (options.proposedCareerUrls ?? []).filter((url) => linked.includes(new URL(url).toString()));
    const targets = [...new Set([...linked, ...proposed])].slice(0, 2);
    if (targets.length > 0) {
      score += 20;
      evidence.push({ kind: "homepage_link", url: targets[0]!, detail: "Official homepage links to a recruitment entry" });
    }

    for (const url of targets) {
      const target = new URL(url);
      const sameDomain = hostnameMatches(target.hostname, candidate.candidateDomain);
      const sourceEvidence: SourceEvidence[] = [];
      if (sameDomain) sourceEvidence.push({ kind: "homepage_link", url: homepage.finalUrl, detail: "Linked by the verified official homepage" });
      else {
        score += 20;
        sourceEvidence.push({ kind: "official_ats_link", url: homepage.finalUrl, detail: "External recruitment tenant linked by the verified official homepage" });
      }
      const page = await fetchHtml(url, fetcher);
      if (CAREER_TEXT.test(cheerio.load(page.html)("body").text())) {
        score += 15;
        sourceEvidence.push({ kind: "career_semantics", url: page.finalUrl, detail: "Page contains recruiting semantics" });
      }
      const classification = classifyCareerSource(page.finalUrl, page.html, sourceEvidence);
      careerSources.push({ url: page.finalUrl, ...classification, evidence: sourceEvidence });
    }

    score = Math.min(100, score);
    const status = decisionStatus(score);
    return { status, score, canonicalName: candidate.canonicalName, officialDomain: candidate.candidateDomain, evidence, failureReason: status === "verified" ? null : "insufficient verified evidence", careerSources: status === "verified" ? careerSources : [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "verification failed";
    return { status: "rejected", score: 0, canonicalName: candidate.canonicalName, officialDomain: candidate.candidateDomain, evidence: [...evidence, { kind: "negative_signal", url: candidate.homepageUrl, detail: message }], failureReason: message, careerSources: [] };
  }
}
