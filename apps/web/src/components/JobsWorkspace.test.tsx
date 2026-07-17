// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobsApi } from "../jobs-api";
import { JobsWorkspace } from "./JobsWorkspace";

const capturedAt = "2026-07-17T10:00:00.000Z";
const job = {
  id: "018a2c8a-51dc-7a81-a240-000000000001",
  fingerprint: "a".repeat(64),
  status: "active" as const,
  source: "tencent",
  sourceJobId: "123",
  sourceUrl: "https://careers.example.com/jobs/123",
  title: "前端开发实习生",
  company: "示例科技",
  location: "上海",
  description: "参与本地 Web 应用开发。",
  capturedAt,
  firstCapturedAt: capturedAt,
  lastCapturedAt: capturedAt,
  sources: [{ source: "tencent", sourceJobId: "123", sourceUrl: "https://careers.example.com/jobs/123", title: "前端开发实习生", company: "示例科技", location: "上海", description: "参与本地 Web 应用开发。", capturedAt }],
};

function createApi(): JobsApi {
  return {
    list: vi.fn().mockResolvedValue({ jobs: [job], total: 1, page: 1, pageSize: 20 }),
    scanTencent: vi.fn().mockResolvedValue({ source: "tencent", fetched: 1, created: 1, updated: 0, completedAt: capturedAt }),
    sourceStatuses: vi.fn().mockResolvedValue([{ source: "tencent", available: true, message: "可用", lastCheckedAt: capturedAt }]),
  };
}

describe("JobsWorkspace", () => {
  afterEach(() => cleanup());

  it("shows source transparency and a public job with an ordinary outbound link", async () => {
    render(<JobsWorkspace api={createApi()} />);

    expect(await screen.findByRole("heading", { name: "前端开发实习生" })).toBeInTheDocument();
    expect(screen.getByText("腾讯：可用")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看公开职位原页" })).toHaveAttribute("href", job.sourceUrl);
  });

  it("requests a Tencent refresh and reloads the list with local keyword filters", async () => {
    const api = createApi();
    render(<JobsWorkspace api={api} />);
    await screen.findByRole("heading", { name: "前端开发实习生" });

    fireEvent.change(screen.getByLabelText("关键词"), { target: { value: "前端" } });
    fireEvent.click(screen.getByRole("button", { name: "更新腾讯公开职位" }));

    await waitFor(() => expect(api.scanTencent).toHaveBeenCalledOnce());
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: "前端" })));
    expect(await screen.findByRole("status")).toHaveTextContent("已更新 1 个公开岗位");
  });
});
