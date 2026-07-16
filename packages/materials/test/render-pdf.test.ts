import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderHtmlToPdf } from "../src/render-pdf.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe("Chinese PDF proof", () => {
  it("generates a PDF whose text layer contains Chinese resume content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-"));
    dirs.push(dir);
    const result = await renderHtmlToPdf({
      html: "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><style>body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}</style><body><h1>张三</h1><p>软件工程实习生</p><p>TypeScript 项目经验</p></body></html>",
      outputPath: path.join(dir, "resume.pdf")
    });
    expect(result.pages).toBe(1);
    expect(result.extractedText).toContain("软件工程实习生");
  }, 30_000);
});
