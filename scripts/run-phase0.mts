import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph } from "docx";
import { z } from "zod";
import { CodexProvider, ensureCodexRuntimeDirectory, OpenAiCompatibleProvider, OllamaProvider } from "@campus-job-agent/ai-providers";
import type { ProbeResult } from "@campus-job-agent/contracts";
import { renderHtmlToPdf } from "@campus-job-agent/materials";
import { parseResume } from "@campus-job-agent/profile";
import { probeOfferBiu, probeTencent } from "@campus-job-agent/sources";
import { failedRequiredProbeNames } from "./phase0-gate.js";
import { formatPhase0Report, shouldUpdateTrackedReport } from "./phase0-report.js";

const localDir = path.resolve(".local/phase0");
const checkedAt = () => new Date().toISOString();
const results: ProbeResult[] = [];
const connectivity = z.object({ ok: z.literal(true) });

await mkdir(localDir, { recursive: true });
results.push(await probeTencent());
results.push(await probeOfferBiu());

async function aiProbe(name: string, provider: { generate<T>(request: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<T> } | null): Promise<ProbeResult> {
  if (!provider) return { name, status: "skip", summary: `${name} environment configuration is missing`, details: {}, checkedAt: checkedAt() };
  try {
    await provider.generate({ system: "Return only valid JSON matching the requested schema.", prompt: "Return {\"ok\":true}.", schema: connectivity });
    return { name, status: "pass", summary: `${name} returned schema-valid JSON`, details: {}, checkedAt: checkedAt() };
  } catch {
    return { name, status: "fail", summary: `${name} structured generation failed`, details: {}, checkedAt: checkedAt() };
  }
}

try {
  const codexDirectory = await ensureCodexRuntimeDirectory(path.join(localDir, "codex-runtime"));
  results.push(await aiProbe("codex", new CodexProvider({ workingDirectory: codexDirectory })));
} catch {
  results.push({ name: "codex", status: "fail", summary: "Codex runtime could not be prepared", details: {}, checkedAt: checkedAt() });
}

const openAi = process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_MODEL
  ? new OpenAiCompatibleProvider({ baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL, apiKey: process.env.OPENAI_COMPATIBLE_API_KEY, model: process.env.OPENAI_COMPATIBLE_MODEL }) : null;
const ollama = process.env.OLLAMA_MODEL
  ? new OllamaProvider({ baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434", model: process.env.OLLAMA_MODEL }) : null;
results.push(await aiProbe("openai-compatible", openAi));
results.push(await aiProbe("ollama", ollama));

const pdfPath = path.join(localDir, "chinese-resume.pdf");
try {
  const pdf = await renderHtmlToPdf({ html: "<!doctype html><meta charset='utf-8'><style>body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}</style><h1>张三</h1><p>软件工程实习生</p>", outputPath: pdfPath });
  results.push({ name: "pdf-output", status: pdf.extractedText.includes("软件工程实习生") ? "pass" : "fail", summary: pdf.extractedText.includes("软件工程实习生") ? "Chinese PDF text layer is extractable" : "Chinese PDF lost text-layer content", details: { pages: pdf.pages }, checkedAt: checkedAt() });
  const parsedPdf = await parseResume({ fileName: "resume.pdf", data: await import("node:fs/promises").then((fs) => fs.readFile(pdfPath)) });
  results.push({ name: "resume-pdf", status: parsedPdf.text.includes("软件工程实习生") ? "pass" : "fail", summary: "PDF resume parsing completed", details: { pages: parsedPdf.pages ?? 0 }, checkedAt: checkedAt() });
} catch {
  results.push({ name: "pdf-output", status: "fail", summary: "Chinese PDF generation failed", details: {}, checkedAt: checkedAt() });
  results.push({ name: "resume-pdf", status: "fail", summary: "PDF resume parsing could not run", details: {}, checkedAt: checkedAt() });
}

try {
  const doc = new Document({ sections: [{ children: [new Paragraph("张三 软件工程实习生"), new Paragraph("TypeScript 项目经验")] }] });
  const parsedDocx = await parseResume({ fileName: "resume.docx", data: await Packer.toBuffer(doc) });
  results.push({ name: "resume-docx", status: parsedDocx.text.includes("软件工程实习生") ? "pass" : "fail", summary: "DOCX resume parsing completed", details: {}, checkedAt: checkedAt() });
} catch {
  results.push({ name: "resume-docx", status: "fail", summary: "DOCX resume parsing failed", details: {}, checkedAt: checkedAt() });
}

await writeFile(path.join(localDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
await mkdir(path.resolve("docs/feasibility"), { recursive: true });
const trackedReportPath = path.resolve("docs/feasibility/phase-0-results.md");
const nextReport = formatPhase0Report(results);
let previousReport: string | null = null;
try {
  previousReport = await readFile(trackedReportPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (shouldUpdateTrackedReport(previousReport, nextReport)) {
  await writeFile(trackedReportPath, nextReport, "utf8");
}

const failures = failedRequiredProbeNames(results);
console.table(results.map(({ name, status, summary }) => ({ name, status, summary })));
if (failures.length > 0) process.exitCode = 1;
