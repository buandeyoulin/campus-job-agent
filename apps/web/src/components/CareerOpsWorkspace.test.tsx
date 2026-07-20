// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareerOpsApi } from "../career-ops-api";
import { CareerOpsWorkspace } from "./CareerOpsWorkspace";

const at = "2026-07-18T10:00:00.000Z";
const job = { id: "018a2c8a-51dc-7a81-a240-000000000001", fingerprint: "f".repeat(64), source: "official-company", sourceJobId: "1", sourceUrl: "https://example.com/jobs/1", title: "数字 IC 验证工程师", company: "示例芯片", location: "上海", description: "负责 UVM 验证", capturedAt: at, status: "active" as const, lifecycleStatus: "active" as const, firstCapturedAt: at, lastCapturedAt: at, sources: [] };
const application = { id: "018a2c8a-51dc-7a81-a240-000000000002", jobId: job.id, status: "saved" as const, note: "", createdAt: at, updatedAt: at };
const preparation = { id: "018a2c8a-51dc-7a81-a240-000000000003", applicationId: application.id, tailoredResumeMarkdown: "# Ray\n\n- UVM 覆盖率收敛", interviewQuestions: [
  { question: "如何搭建 UVM 环境？", answerOutline: "说明组件、连接和 phase", evidence: ["UVM 项目"] },
  { question: "如何完成覆盖率收敛？", answerOutline: "说明缺口分析", evidence: ["覆盖率"] },
  { question: "为什么选择该岗位？", answerOutline: "连接专业与经历", evidence: ["微电子"] },
], gaps: ["形式验证经历尚未确认"], createdAt: at, updatedAt: at };

function api(): CareerOpsApi {
  return {
    listMatches: vi.fn(async (useAi) => [{ job, eligible: true, score: useAi ? 91 : 75, reasons: [], evidence: ["技能：UVM"], aiAssessment: useAi ? { jobId: job.id, fitScore: 95, summary: "验证经验高度匹配", strengths: ["UVM"], gaps: ["形式验证"] } : null }]),
    listApplications: vi.fn().mockResolvedValue([]),
    createApplication: vi.fn().mockResolvedValue(application),
    updateApplication: vi.fn().mockResolvedValue({ ...application, status: "applied", note: "已在官网手动投递" }),
    prepareApplication: vi.fn().mockResolvedValue(preparation),
  };
}

describe("CareerOpsWorkspace", () => {
  afterEach(() => cleanup());

  it("runs AI matching, explains fit, and adds a job to manual tracking", async () => {
    const client = api();
    render(<CareerOpsWorkspace api={client} />);
    expect(await screen.findByText("数字 IC 验证工程师")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 自动筛选岗位" }));
    expect(await screen.findByText("验证经验高度匹配")).toBeInTheDocument();
    expect(screen.getByText("91 分")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加入求职跟踪" }));
    await waitFor(() => expect(client.createApplication).toHaveBeenCalledWith(job.id));
    expect(screen.queryByRole("button", { name: /自动投递/ })).not.toBeInTheDocument();
  });

  it("updates manually reported progress and displays persisted resume and interview preparation", async () => {
    const client = api();
    vi.mocked(client.listApplications).mockResolvedValue([{ application, job, events: [], preparation: null }]);
    render(<CareerOpsWorkspace api={client} />);
    const status = await screen.findByLabelText("求职阶段");
    fireEvent.change(status, { target: { value: "applied" } });
    fireEvent.change(screen.getByLabelText("进度备注"), { target: { value: "已在官网手动投递" } });
    fireEvent.click(screen.getByRole("button", { name: "保存进度" }));
    await waitFor(() => expect(client.updateApplication).toHaveBeenCalledWith(application.id, { status: "applied", note: "已在官网手动投递" }));
    fireEvent.click(screen.getByRole("button", { name: "生成定制简历与面试包" }));
    expect(await screen.findByText(/UVM 覆盖率收敛/)).toBeInTheDocument();
    expect(screen.getByText("如何搭建 UVM 环境？")).toBeInTheDocument();
    expect(screen.getByText("形式验证经历尚未确认")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载定制简历 Markdown" })).toHaveAttribute("download", "tailored-resume.md");
    expect(screen.getByRole("link", { name: "下载定制简历 PDF" })).toHaveAttribute("href", `/api/applications/${application.id}/resume.pdf`);
    expect(screen.getByText(/状态只记录你已经手动完成的操作/)).toBeInTheDocument();
  });
});
