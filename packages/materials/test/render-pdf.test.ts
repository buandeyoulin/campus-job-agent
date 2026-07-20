import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderHtmlToPdf } from "../src/render-pdf.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("Chinese PDF proof", () => {
  it("generates a PDF whose text layer contains Chinese resume content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-"));
    dirs.push(dir);
    const result = await renderHtmlToPdf({
      html: "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><style>body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif}</style><body><h1>Ray</h1><p>数字 IC 验证工程师</p><p>UVM 覆盖率项目经验</p></body></html>",
      outputPath: path.join(dir, "resume.pdf"),
    });
    expect(result.pages).toBe(1);
    expect(result.extractedText).toContain("数字 IC 验证工程师");
  }, 30_000);
});
