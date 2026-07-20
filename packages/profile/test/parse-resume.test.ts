import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it, vi } from "vitest";
import { parseResume } from "../src/parse-resume.js";

describe("resume parsing", () => {
  it("extracts Chinese text from a real DOCX buffer", async () => {
    const document = new Document({ sections: [{ children: [new Paragraph("张三 软件工程实习生"), new Paragraph("TypeScript 项目经验")] }] });
    const data = await Packer.toBuffer(document);
    const result = await parseResume({ fileName: "resume.docx", data });
    expect(result.kind).toBe("docx");
    expect(result.text).toContain("软件工程实习生");
  });

  it("routes PDF bytes through the PDF extractor and normalizes whitespace", async () => {
    const pdf = vi.fn(async () => ({ text: "张三\u0000\r\n\r\n项目经历", pages: 2 }));
    const result = await parseResume({ fileName: "resume.PDF", data: Buffer.from("pdf") }, { pdf, docx: vi.fn() });
    expect(result).toEqual({ kind: "pdf", text: "张三\n\n项目经历", pages: 2, warnings: [] });
  });

  it("rejects unsupported upload types", async () => {
    await expect(parseResume({ fileName: "resume.txt", data: Buffer.from("x") })).rejects.toThrow("Unsupported resume type: .txt");
  });
});
