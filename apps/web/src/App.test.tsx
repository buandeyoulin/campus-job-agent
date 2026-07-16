// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { JobPreferences, OnboardingSnapshot, ProfileDraft } from "@campus-job-agent/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { OnboardingApi } from "./api";

afterEach(cleanup);

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
    expect(screen.getByRole("button", { name: "添加经历" })).toBeEnabled();
  });
});
