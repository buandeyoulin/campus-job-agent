// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { CandidateFactContent, JobPreferences, OnboardingSnapshot, ProfileDraft, ProfileFact, ResumeUploadSummary } from "@campus-job-agent/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { OnboardingApi } from "./api";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const profile: ProfileDraft = {
  displayName: "林同学",
  email: "",
  phone: "",
  currentCity: "武汉",
  degree: "本科",
  major: "计算机科学与技术",
  graduationDate: "2027-06",
};

const preferences: JobPreferences = {
  targetRoles: ["前端开发实习生"],
  excludedRoles: [],
  recruitmentTypes: ["campus"],
  targetCities: ["上海"],
  remotePreference: "no_preference",
  availabilityFrom: "",
  availabilityTo: "",
  daysPerWeek: null,
  minimumDurationMonths: null,
  preferredIndustries: [],
  preferredCompanies: [],
  companyBlacklist: [],
};

function snapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    profile: null,
    preferences: null,
    completion: {
      percentage: 0,
      completed: [],
      missing: [
        "profile.name",
        "profile.city",
        "profile.education",
        "preferences.role",
        "preferences.recruitmentType",
        "preferences.location",
        "facts.education",
        "facts.experience",
      ],
    },
    activeResume: null,
    facts: { education: [], internship: [], project: [], skill: [] },
    factCounts: { pending: 0, confirmed: 0, rejected: 0 },
    ...overrides,
  };
}

function api(initial: OnboardingSnapshot) {
  return {
    getSnapshot: vi.fn<OnboardingApi["getSnapshot"]>().mockResolvedValue(initial),
    saveProfile: vi.fn<OnboardingApi["saveProfile"]>(),
    savePreferences: vi.fn<OnboardingApi["savePreferences"]>(),
    createFact: vi.fn<OnboardingApi["createFact"]>(),
    updateFact: vi.fn<OnboardingApi["updateFact"]>(),
    actOnFact: vi.fn<OnboardingApi["actOnFact"]>(),
    confirmFacts: vi.fn<OnboardingApi["confirmFacts"]>(),
    uploadResume: vi.fn<OnboardingApi["uploadResume"]>(),
    extractResume: vi.fn<OnboardingApi["extractResume"]>(),
    retryResume: vi.fn<OnboardingApi["retryResume"]>(),
    deleteResume: vi.fn<OnboardingApi["deleteResume"]>(),
  } satisfies OnboardingApi;
}

const resumeBase: ResumeUploadSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  originalFileName: "虚构简历.pdf",
  kind: "pdf",
  byteSize: 100,
  sha256: "a".repeat(64),
  isActive: true,
  parseStatus: "pending",
  extractionStatus: "not_started",
  failureCode: null,
  warnings: [],
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

let factSequence = 0;
function fact(content: CandidateFactContent, status: ProfileFact["status"] = "pending", duplicateOfFactId: string | null = null): ProfileFact {
  factSequence += 1;
  return {
    id: `00000000-0000-4000-8000-${factSequence.toString().padStart(12, "0")}`,
    status,
    source: "manual",
    resumeUploadId: null,
    sourceExcerpt: null,
    content,
    duplicateOfFactId,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    confirmedAt: status === "confirmed" ? "2026-07-16T00:00:00.000Z" : null,
  };
}

function withFacts(facts: ProfileFact[]): OnboardingSnapshot {
  const grouped: OnboardingSnapshot["facts"] = { education: [], internship: [], project: [], skill: [] };
  for (const item of facts) grouped[item.content.type].push(item);
  return snapshot({
    profile,
    facts: grouped,
    factCounts: {
      pending: facts.filter((item) => item.status === "pending").length,
      confirmed: facts.filter((item) => item.status === "confirmed").length,
      rejected: facts.filter((item) => item.status === "rejected").length,
    },
  });
}

describe("profile workspace", () => {
  it("shows completion percentage and translated missing checklist items", async () => {
    const client = api(snapshot({
      completion: { percentage: 25, completed: ["profile.name"], missing: ["profile.city", "preferences.role"] },
    }));
    render(<App api={client} />);

    expect(await screen.findByText("25%")).toBeInTheDocument();
    const completion = screen.getByLabelText("资料完成情况");
    expect(within(completion).getByText("当前城市")).toBeInTheDocument();
    expect(within(completion).getByText("目标岗位")).toBeInTheDocument();
  });

  it("saves basic information without requiring optional contact fields", async () => {
    const client = api(snapshot());
    client.saveProfile.mockImplementation(async (value: ProfileDraft) => snapshot({ profile: value }));
    render(<App api={client} />);

    fireEvent.change(await screen.findByLabelText("姓名或称呼"), { target: { value: "林同学" } });
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }));

    await waitFor(() => expect(client.saveProfile).toHaveBeenCalledWith(expect.objectContaining({
      displayName: "林同学",
      email: "",
      phone: "",
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("已保存");
  });

  it("keeps profile edits and shows an inline error when profile save fails", async () => {
    const client = api(snapshot());
    client.saveProfile.mockRejectedValue(new Error("本地资料保存失败"));
    render(<App api={client} />);

    const name = await screen.findByLabelText("姓名或称呼");
    fireEvent.change(name, { target: { value: "林同学" } });
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("本地资料保存失败");
    expect(name).toHaveValue("林同学");
  });

  it("disables preference saving until the required profile exists", async () => {
    render(<App api={api(snapshot())} />);

    expect(await screen.findByRole("button", { name: "保存求职偏好" })).toBeDisabled();
    expect(screen.getByText("请先保存姓名或称呼，再设置求职偏好。")).toBeInTheDocument();
  });

  it("saves target roles and cities independently after the profile exists", async () => {
    const client = api(snapshot({ profile, preferences }));
    client.savePreferences.mockImplementation(async (value: JobPreferences) => snapshot({ profile, preferences: value }));
    render(<App api={client} />);

    const roles = await screen.findByLabelText("目标岗位");
    fireEvent.change(roles, { target: { value: "前端开发实习生, 产品实习生\n前端开发实习生" } });
    fireEvent.change(screen.getByLabelText("目标城市"), { target: { value: "上海, 杭州" } });
    fireEvent.click(screen.getByRole("button", { name: "保存求职偏好" }));

    await waitFor(() => expect(client.savePreferences).toHaveBeenCalledWith(expect.objectContaining({
      targetRoles: ["前端开发实习生", "产品实习生"],
      targetCities: ["上海", "杭州"],
    })));
  });

  it("keeps the profile card committed when preference saving fails", async () => {
    const client = api(snapshot({ profile, preferences }));
    client.saveProfile.mockImplementation(async (value: ProfileDraft) => snapshot({ profile: value, preferences }));
    client.savePreferences.mockRejectedValue(new Error("偏好保存失败"));
    render(<App api={client} />);

    const name = await screen.findByLabelText("姓名或称呼");
    fireEvent.change(name, { target: { value: "林同学（已更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }));
    await waitFor(() => expect(client.saveProfile).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("目标岗位"), { target: { value: "算法实习生" } });
    fireEvent.click(screen.getByRole("button", { name: "保存求职偏好" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("偏好保存失败");
    expect(name).toHaveValue("林同学（已更新）");
  });

  it("renders a usable manual-fact action when there is no resume", async () => {
    render(<App api={api(snapshot({ profile }))} />);

    expect(await screen.findByText("还没有上传简历")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动添加事实" })).toBeEnabled();
  });
});

describe("resume and fact workspace", () => {
  it("uploads one PDF or DOCX and reports validation failures inline", async () => {
    const initial = snapshot({ profile });
    const client = api(initial);
    client.uploadResume.mockResolvedValue(snapshot({ profile, activeResume: resumeBase }));
    render(<App api={client} />);
    const input = await screen.findByLabelText("上传简历");

    fireEvent.change(input, { target: { files: [new File(["x"], "resume.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("仅支持 PDF 或 DOCX");
    fireEvent.change(input, { target: { files: [new File(["%PDF-"], "resume.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(client.uploadResume).toHaveBeenCalledTimes(1));
  });

  it("does not start extraction until cloud-processing acknowledgement is checked", async () => {
    const client = api(snapshot({ profile, activeResume: resumeBase }));
    client.extractResume.mockResolvedValue(undefined);
    render(<App api={client} />);

    const start = await screen.findByRole("button", { name: "开始 AI 提取" });
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByLabelText("我了解脱敏后的简历文本会发送给所选 AI 提供方处理"));
    expect(start).toBeEnabled();
    fireEvent.click(start);
    await waitFor(() => expect(client.extractResume).toHaveBeenCalledWith(resumeBase.id));
  });

  it("shows parsing, extraction, awaiting-confirmation, and stable failure states", async () => {
    const states: Array<[Partial<ResumeUploadSummary>, string]> = [
      [{ parseStatus: "parsing", extractionStatus: "queued" }, "正在解析"],
      [{ parseStatus: "parsed", extractionStatus: "extracting" }, "正在进行 AI 提取"],
      [{ parseStatus: "parsed", extractionStatus: "awaiting_confirmation" }, "等待确认候选事实"],
      [{ parseStatus: "parsed", extractionStatus: "failed", failureCode: "extraction_failed" }, "AI 提取失败"],
    ];
    for (const [patch, label] of states) {
      const view = render(<App api={api(snapshot({ profile, activeResume: { ...resumeBase, ...patch } }))} />);
      expect(await screen.findByText(label)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("polls only while work is active and stops after a stable state", async () => {
    vi.useFakeTimers();
    const active = snapshot({ profile, activeResume: { ...resumeBase, extractionStatus: "queued" } });
    const stable = snapshot({ profile, activeResume: { ...resumeBase, parseStatus: "parsed", extractionStatus: "completed" } });
    const client = api(active);
    client.getSnapshot.mockReset().mockResolvedValueOnce(active).mockResolvedValue(stable);
    render(<App api={client} />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(client.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("retries a failed extraction without requiring a new upload", async () => {
    const failed = { ...resumeBase, extractionStatus: "failed" as const, failureCode: "extraction_failed" as const };
    const client = api(snapshot({ profile, activeResume: failed }));
    client.retryResume.mockResolvedValue(undefined);
    render(<App api={client} />);

    fireEvent.click(await screen.findByRole("button", { name: "重试 AI 提取" }));
    await waitFor(() => expect(client.retryResume).toHaveBeenCalledWith(failed.id));
  });

  it("adds and edits a manual education, internship, project, or skill fact", async () => {
    const initial = withFacts([]);
    const skill = fact({ type: "skill", name: "TypeScript", category: "编程语言", evidence: "课程项目" });
    const client = api(initial);
    client.getSnapshot.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(withFacts([skill]));
    client.createFact.mockResolvedValue(skill);
    render(<App api={client} />);

    fireEvent.click(await screen.findByRole("button", { name: "手动添加事实" }));
    fireEvent.change(screen.getByLabelText("事实类型"), { target: { value: "skill" } });
    fireEvent.change(screen.getByLabelText("技能名称"), { target: { value: "TypeScript" } });
    fireEvent.change(screen.getByLabelText("技能分类"), { target: { value: "编程语言" } });
    fireEvent.click(screen.getByRole("button", { name: "保存事实" }));
    await waitFor(() => expect(client.createFact).toHaveBeenCalledWith(expect.objectContaining({ type: "skill", name: "TypeScript" })));

    const item = within(await screen.findByLabelText("事实：TypeScript"));
    client.updateFact.mockResolvedValue({
      ...skill,
      content: { type: "skill", name: "TypeScript 5", category: "编程语言", evidence: "课程项目" },
    });
    fireEvent.click(item.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("技能名称"), { target: { value: "TypeScript 5" } });
    fireEvent.click(screen.getByRole("button", { name: "保存事实" }));
    await waitFor(() => expect(client.updateFact).toHaveBeenCalledWith(skill.id, expect.objectContaining({ name: "TypeScript 5" })));
  });

  it("filters facts by pending, confirmed, and rejected counts", async () => {
    const facts = [
      fact({ type: "skill", name: "Go", category: "", evidence: "" }),
      fact({ type: "skill", name: "SQL", category: "", evidence: "" }, "confirmed"),
      fact({ type: "skill", name: "Rust", category: "", evidence: "" }, "rejected"),
    ];
    render(<App api={api(withFacts(facts))} />);
    expect(await screen.findByRole("button", { name: "待确认 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已确认 1" }));
    expect(screen.getByLabelText("事实：SQL")).toBeInTheDocument();
    expect(screen.queryByLabelText("事实：Go")).not.toBeInTheDocument();
  });

  it("confirms, rejects, and deletes one fact", async () => {
    const pending = fact({ type: "skill", name: "Go", category: "", evidence: "" });
    const client = api(withFacts([pending]));
    client.getSnapshot.mockResolvedValue(withFacts([pending]));
    client.actOnFact.mockResolvedValue(pending);
    render(<App api={client} />);
    const item = within(await screen.findByLabelText("事实：Go"));
    fireEvent.click(item.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(client.actOnFact).toHaveBeenCalledWith(pending.id, "confirm"));
    fireEvent.click(item.getByRole("button", { name: "拒绝" }));
    await waitFor(() => expect(client.actOnFact).toHaveBeenCalledWith(pending.id, "reject"));
    fireEvent.click(item.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(client.actOnFact).toHaveBeenCalledWith(pending.id, "delete"));
  });

  it("batch-confirms only explicitly selected pending facts", async () => {
    const go = fact({ type: "skill", name: "Go", category: "", evidence: "" });
    const sql = fact({ type: "skill", name: "SQL", category: "", evidence: "" });
    const client = api(withFacts([go, sql]));
    client.confirmFacts.mockResolvedValue(withFacts([go, sql]));
    client.getSnapshot.mockResolvedValue(withFacts([go, sql]));
    render(<App api={client} />);

    fireEvent.click(await screen.findByLabelText("选择 Go"));
    fireEvent.click(screen.getByRole("button", { name: "批量确认所选" }));
    await waitFor(() => expect(client.confirmFacts).toHaveBeenCalledWith([go.id]));
  });

  it("shows side-by-side content for a duplicate suggestion", async () => {
    const original = fact({ type: "skill", name: "Python", category: "语言", evidence: "课程" }, "confirmed");
    const candidate = fact({ type: "skill", name: "Python 3", category: "语言", evidence: "项目" }, "pending", original.id);
    render(<App api={api(withFacts([original, candidate]))} />);

    expect(await screen.findByText("候选事实")).toBeInTheDocument();
    expect(screen.getByText("可能重复的已有事实")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "合并" })).not.toBeInTheDocument();
  });

  it("keeps manual fact entry usable when extraction is unavailable", async () => {
    const failed = { ...resumeBase, extractionStatus: "failed" as const, failureCode: "extraction_output_invalid" as const };
    render(<App api={api(snapshot({ profile, activeResume: failed }))} />);

    expect(await screen.findByRole("button", { name: "手动添加事实" })).toBeEnabled();
  });
});
