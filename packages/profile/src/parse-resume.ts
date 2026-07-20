import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export interface ResumeInput { fileName: string; data: Buffer }
export interface ParsedResume { kind: "pdf" | "docx"; text: string; pages?: number; warnings: string[] }
export interface ResumeExtractors {
  pdf(data: Buffer): Promise<{ text: string; pages: number }>;
  docx(data: Buffer): Promise<{ text: string; warnings: string[] }>;
}

function normalize(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const defaultExtractors: ResumeExtractors = {
  async pdf(data) {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const result = await extractText(pdf, { mergePages: true });
    return { text: result.text, pages: result.totalPages };
  },
  async docx(data) {
    const result = await mammoth.extractRawText({ buffer: data });
    return { text: result.value, warnings: result.messages.map((message) => message.message) };
  },
};

export async function parseResume(input: ResumeInput, extractors: ResumeExtractors = defaultExtractors): Promise<ParsedResume> {
  const extension = path.extname(input.fileName).toLowerCase();
  if (extension === ".pdf") {
    const result = await extractors.pdf(input.data);
    return { kind: "pdf", text: normalize(result.text), pages: result.pages, warnings: [] };
  }
  if (extension === ".docx") {
    const result = await extractors.docx(input.data);
    return { kind: "docx", text: normalize(result.text), warnings: result.warnings };
  }
  throw new Error(`Unsupported resume type: ${extension || "none"}`);
}
