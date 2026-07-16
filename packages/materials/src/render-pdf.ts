import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";

export interface RenderPdfInput { html: string; outputPath: string }

export async function renderHtmlToPdf(input: RenderPdfInput): Promise<{ path: string; pages: number; extractedText: string }> {
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(input.html, { waitUntil: "networkidle" });
    await page.pdf({ path: input.outputPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
  const bytes = await readFile(input.outputPath);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: true });
  return { path: input.outputPath, pages: extracted.totalPages, extractedText: extracted.text };
}
