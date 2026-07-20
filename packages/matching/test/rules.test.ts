import { describe, expect, it } from "vitest";
import { evaluateJobMatch, rankJobMatches } from "../src/index.js";

const preferences = {
  targetRoles: ["数字 IC 验证工程师"], excludedRoles: ["销售"], recruitmentTypes: ["campus" as const], targetCities: ["上海"],
  remotePreference: "no_preference" as const, availabilityFrom: "", availabilityTo: "", daysPerWeek: null, minimumDurationMonths: null,
  preferredIndustries: [], preferredCompanies: ["示例芯片"], companyBlacklist: ["不考虑公司"],
};
const capturedAt = "2026-07-17T10:00:00.000Z";
const job = {
  id: "018a2c8a-51dc-7a81-a240-000000000001", fingerprint: "a".repeat(64), status: "active" as const, lifecycleStatus: "active" as const,
  source: "official-company", sourceJobId: "1", sourceUrl: "https://careers.example.com/jobs/1", title: "数字 IC 验证工程师", company: "示例芯片", location: "上海", description: "熟悉 UVM 和 SystemVerilog", capturedAt, firstCapturedAt: capturedAt, lastCapturedAt: capturedAt, sources: [],
};
const facts = [{ id: "018a2c8a-51dc-7a81-a240-000000000002", status: "confirmed" as const, source: "manual" as const, resumeUploadId: null, sourceExcerpt: null, duplicateOfFactId: null, createdAt: capturedAt, updatedAt: capturedAt, confirmedAt: capturedAt, content: { type: "skill" as const, name: "UVM", category: "验证", evidence: "课程项目" } }];

describe("deterministic job matching", () => {
  it("explains a passing job with score evidence from confirmed facts", () => {
    const match = evaluateJobMatch(job, preferences, facts);
    expect(match).toMatchObject({ eligible: true, score: 85, aiAssessment: null });
    expect(match.evidence).toContain("技能：UVM");
  });
  it("filters blacklisted or closed jobs before ranking and keeps reasons visible", () => {
    const blocked = evaluateJobMatch({ ...job, company: "不考虑公司" }, preferences, facts);
    const closed = evaluateJobMatch({ ...job, lifecycleStatus: "closed" as const }, preferences, facts);
    expect(blocked.reasons).toContain("公司在黑名单中");
    expect(closed.reasons).toContain("岗位已过期或关闭");
    expect(rankJobMatches([blocked, closed, evaluateJobMatch(job, preferences, facts)]).map((match) => match.job.id)).toEqual([job.id]);
  });
});
