import { describe, expect, it } from "vitest";
import { evaluateJobMatch, rankJobMatches } from "../src/index.js";

const preferences = {
  targetRoles: ["前端开发实习生"],
  excludedRoles: ["销售"],
  recruitmentTypes: ["daily_internship" as const],
  targetCities: ["上海"],
  remotePreference: "no_preference" as const,
  availabilityFrom: "2026-08-01",
  availabilityTo: "2027-01-31",
  daysPerWeek: 4,
  minimumDurationMonths: 4,
  preferredIndustries: [],
  preferredCompanies: ["示例科技"],
  companyBlacklist: ["不考虑公司"],
};
const job = {
  id: "018a2c8a-51dc-7a81-a240-000000000001",
  fingerprint: "a".repeat(64), status: "active" as const, source: "tencent", sourceJobId: "1", sourceUrl: "https://careers.example.com/jobs/1",
  title: "前端开发实习生", company: "示例科技", location: "上海", description: "熟悉 TypeScript 和 React。", capturedAt: "2026-07-17T10:00:00.000Z", firstCapturedAt: "2026-07-17T10:00:00.000Z", lastCapturedAt: "2026-07-17T10:00:00.000Z",
  sources: [{ source: "tencent", sourceJobId: "1", sourceUrl: "https://careers.example.com/jobs/1", title: "前端开发实习生", company: "示例科技", location: "上海", description: "熟悉 TypeScript 和 React。", capturedAt: "2026-07-17T10:00:00.000Z" }],
};
const facts = [{ id: "018a2c8a-51dc-7a81-a240-000000000002", status: "confirmed" as const, source: "manual" as const, resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, createdAt: "2026-07-17T10:00:00.000Z", updatedAt: "2026-07-17T10:00:00.000Z", confirmedAt: "2026-07-17T10:00:00.000Z", content: { type: "skill" as const, name: "TypeScript", category: "编程语言", evidence: "课程项目" } }];

describe("deterministic job matching", () => {
  it("explains a passing job with score evidence from confirmed facts", () => {
    const match = evaluateJobMatch(job, preferences, facts);
    expect(match).toMatchObject({ eligible: true, score: 85 });
    expect(match.evidence).toContain("技能：TypeScript");
  });

  it("filters blacklisted companies before ranking and keeps the reason visible", () => {
    const blocked = evaluateJobMatch({ ...job, company: "不考虑公司" }, preferences, facts);
    expect(blocked).toMatchObject({ eligible: false, score: 0 });
    expect(blocked.reasons).toContain("公司在黑名单中");
    expect(rankJobMatches([blocked, evaluateJobMatch(job, preferences, facts)]).map((match) => match.job.id)).toEqual([job.id]);
  });
});
