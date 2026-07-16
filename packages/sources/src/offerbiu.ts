import type { ProbeResult } from "@campus-job-agent/contracts";
import { chromium } from "playwright";

function metric(text: string, label: string): number {
  const match = text.replace(/\s+/g, " ").match(new RegExp(`${label}\\s*(\\d+)`));
  return match?.[1] ? Number(match[1]) : 0;
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

export async function probeOfferBiu(now: () => Date = () => new Date()): Promise<ProbeResult> {
  const checkedAt = now().toISOString();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("https://offerbiu.com/companies/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    return classifyOfferBiuMetrics(await page.locator("body").innerText(), checkedAt);
  } catch {
    return { name: "offerbiu", status: "fail", summary: "OfferBiu public page could not be inspected", details: {}, checkedAt };
  } finally {
    await browser?.close();
  }
}
