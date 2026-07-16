import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, ProfileRepository, type StorageDatabase } from "../src/index.js";

const roots: string[] = [];
const openStorages: StorageDatabase[] = [];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-repo-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  openStorages.push(storage);
  return {
    storage,
    repository: new ProfileRepository(storage.db, () => new Date("2026-07-16T00:00:00.000Z")),
  };
}

afterEach(async () => {
  for (const storage of openStorages.splice(0)) {
    try {
      storage.close();
    } catch {
      // Tests may close the connection before cleanup.
    }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("profile repository", () => {
  it("returns null before either card has been saved", async () => {
    const { storage, repository } = await setup();

    expect(repository.getProfile()).toBeNull();
    expect(repository.getPreferences()).toBeNull();
    storage.close();
  });

  it("upserts and revalidates the singleton profile", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({
      displayName: "虚构候选人",
      email: "candidate@example.test",
      phone: "",
      currentCity: "成都",
      degree: "本科",
      major: "信息管理",
      graduationDate: "2027-06",
    });

    const updated = repository.saveProfile({
      displayName: "虚构候选人",
      email: "candidate@example.test",
      phone: "138 0013 8000",
      currentCity: "重庆",
      degree: "本科",
      major: "信息管理",
      graduationDate: "2027-06",
    });

    expect(updated.phone).toBe("13800138000");
    expect(repository.getProfile()).toEqual(updated);
    expect(repository.getProfile()?.currentCity).toBe("重庆");
    storage.close();
  });

  it("persists and replaces validated preferences after the profile exists", async () => {
    const { storage, repository } = await setup();
    repository.saveProfile({ displayName: "虚构候选人", email: "", phone: "", currentCity: "成都", degree: "本科", major: "信息管理", graduationDate: "2027-06" });

    repository.savePreferences({
      targetRoles: ["产品实习生"],
      excludedRoles: ["销售"],
      recruitmentTypes: ["daily_internship"],
      targetCities: ["成都"],
      remotePreference: "hybrid",
      availabilityFrom: "2026-08-01",
      availabilityTo: "2027-01-31",
      daysPerWeek: 4,
      minimumDurationMonths: 4,
      preferredIndustries: ["软件"],
      preferredCompanies: [],
      companyBlacklist: [],
    });

    const replaced = repository.savePreferences({
      targetRoles: ["产品实习生", "项目助理"],
      excludedRoles: [],
      recruitmentTypes: ["campus"],
      targetCities: ["重庆", "成都"],
      remotePreference: "onsite",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: ["软件"],
      preferredCompanies: ["示例科技"],
      companyBlacklist: [],
    });

    expect(repository.getPreferences()).toEqual(replaced);
    expect(repository.getPreferences()?.targetCities).toEqual(["重庆", "成都"]);
    storage.close();
  });

  it("does not create preferences without a saved profile", async () => {
    const { storage, repository } = await setup();

    expect(() => repository.savePreferences({
      targetRoles: ["测试开发"],
      excludedRoles: [],
      recruitmentTypes: ["campus"],
      targetCities: ["深圳"],
      remotePreference: "onsite",
      availabilityFrom: "",
      availabilityTo: "",
      daysPerWeek: null,
      minimumDurationMonths: null,
      preferredIndustries: [],
      preferredCompanies: [],
      companyBlacklist: [],
    })).toThrow("Profile must be saved before preferences");
    storage.close();
  });
});
