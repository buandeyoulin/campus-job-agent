// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryApi } from "../company-directory-api";
import { CompanyDirectoryWorkspace } from "./CompanyDirectoryWorkspace";

const at = "2026-07-18T08:00:00.000Z";
const company = {
  id: "018a2c8a-51dc-7a81-a240-000000000001", canonicalName: "Example Semiconductor", aliases: ["Example Semi"],
  officialDomain: "example.com", industries: ["chip_design"], regions: ["中国"], origin: "seed" as const, status: "active" as const,
  verificationScore: 100, verificationEvidence: [{ kind: "official_domain" as const, url: "https://example.com/", detail: "官网身份已核验" }],
  verifiedAt: at, createdAt: at, updatedAt: at, careerSourceCount: 1, jobCount: 3,
};
const source = {
  id: "018a2c8a-51dc-7a81-a240-000000000002", companyId: company.id, canonicalUrl: "https://example.com/careers", kind: "html" as const,
  adapter: "static-example", verificationEvidence: [{ kind: "homepage_link" as const, url: "https://example.com/", detail: "官网链接" }],
  status: "active" as const, healthScore: 100, lastSuccessAt: at, lastFailureAt: null, lastCompleteSyncAt: at, nextSyncAt: null,
  backoffUntil: null, consecutiveFailures: 0, lastError: null, createdAt: at, updatedAt: at,
};
const candidate = {
  id: "018a2c8a-51dc-7a81-a240-000000000003", canonicalName: "Needs Review", normalizedName: "needs review", candidateDomain: "review.example",
  homepageUrl: "https://review.example/", origin: "manual" as const, status: "quarantined" as const, verificationScore: 55,
  evidence: [{ kind: "official_domain" as const, url: "https://review.example/", detail: "官网可访问" }], failureReason: "缺少招聘入口证据",
  retryCount: 1, nextRetryAt: at, createdAt: at, updatedAt: at,
};

function createApi(): CompanyDirectoryApi {
  return {
    list: vi.fn().mockResolvedValue({ companies: [company], total: 1, page: 1, pageSize: 20 }),
    listCandidates: vi.fn().mockResolvedValue({ candidates: [candidate], total: 1, page: 1, pageSize: 20 }),
    listCareerSources: vi.fn().mockResolvedValue([source]),
    importSeed: vi.fn().mockResolvedValue({ fetched: 20, created: 20, updated: 0, completedAt: at }),
    discover: vi.fn().mockResolvedValue({ searched: 4, candidatesCreated: 2, candidatesUpdated: 0, verified: 1, quarantined: 1, rejected: 0, completedAt: at }),
    syncJobs: vi.fn().mockResolvedValue({ sourcesSelected: 1, sourcesSucceeded: 1, sourcesSkipped: 0, sourcesFailed: 0, jobsFetched: 3, created: 3, updated: 0, completedAt: at }),
    addCompany: vi.fn().mockResolvedValue({ candidate, verification: { processed: 1, verified: 0, quarantined: 1, rejected: 0, completedAt: at } }),
    addCareerSource: vi.fn().mockResolvedValue({ source, created: true }),
  };
}

describe("CompanyDirectoryWorkspace", () => {
  afterEach(() => cleanup());

  it("shows verified companies, filters, provenance, source health, job count, and quarantine tab", async () => {
    const api = createApi();
    render(<CompanyDirectoryWorkspace api={api} />);

    expect(await screen.findByText("Example Semiconductor", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/3 个有效岗位/)).toBeInTheDocument();
    expect(screen.getByText(/核验分 100/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "官方招聘入口" })).toHaveAttribute("href", "https://example.com/careers");
    expect(screen.getByText(/健康度 100/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("公司关键词"), { target: { value: "芯片" } });
    fireEvent.change(screen.getByLabelText("行业"), { target: { value: "chip_design" } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: "芯片", industry: "chip_design" })));

    fireEvent.click(screen.getByRole("tab", { name: "待核验与隔离" }));
    expect(await screen.findByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("缺少招聘入口证据")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /自动投递/ })).not.toBeInTheDocument();
  });

  it("runs seed import, discovery, official sync, and verified manual additions", async () => {
    const api = createApi();
    render(<CompanyDirectoryWorkspace api={api} />);
    await screen.findByText("Example Semiconductor", { selector: "strong" });

    fireEvent.click(screen.getByRole("button", { name: "导入内置芯片公司" }));
    expect(await screen.findByText(/导入完成：新增 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "发现新公司" }));
    expect(await screen.findByText(/发现完成：核验通过 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更新官方岗位" }));
    expect(await screen.findByText(/岗位更新完成：抓取 3/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("公司名称"), { target: { value: "Manual Semi" } });
    fireEvent.change(screen.getByLabelText("公司官网"), { target: { value: "https://manual.example/" } });
    fireEvent.click(screen.getByRole("button", { name: "提交公司核验" }));
    await waitFor(() => expect(api.addCompany).toHaveBeenCalledWith({ canonicalName: "Manual Semi", homepageUrl: "https://manual.example/" }));

    fireEvent.change(screen.getByLabelText("招聘入口网址"), { target: { value: "https://example.com/careers" } });
    fireEvent.click(screen.getByRole("button", { name: "核验并添加入口" }));
    await waitFor(() => expect(api.addCareerSource).toHaveBeenCalledWith(company.id, "https://example.com/careers"));
    expect(screen.getByText(/投递仍需你在官网手动完成/)).toBeInTheDocument();
  });

  it("keeps local actions enabled when optional discovery is not configured", async () => {
    const api = createApi();
    vi.mocked(api.discover).mockRejectedValueOnce(new Error("公司发现未配置；请设置 BRAVE_SEARCH_API_KEY"));
    render(<CompanyDirectoryWorkspace api={api} />);
    await screen.findByText("Example Semiconductor", { selector: "strong" });
    fireEvent.click(screen.getByRole("button", { name: "发现新公司" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("公司发现未配置");
    expect(screen.getByRole("button", { name: "导入内置芯片公司" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "更新官方岗位" })).toBeEnabled();
  });
});
