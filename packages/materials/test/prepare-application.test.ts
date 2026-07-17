import { describe, expect, it } from "vitest";
import { createInterviewPack, createTailoredResumeDraft } from "../src/index.js";

const job = { title: "前端开发实习生", company: "示例科技", description: "需要 TypeScript、React 和沟通能力。" };
const facts = [
  { status: "confirmed" as const, content: { type: "skill" as const, name: "TypeScript", category: "语言", evidence: "课程项目" } },
  { status: "pending" as const, content: { type: "skill" as const, name: "React", category: "框架", evidence: "" } },
];

describe("application preparation", () => {
  it("creates a tailored resume draft from confirmed facts only", () => {
    const draft = createTailoredResumeDraft(job, facts as never);
    expect(draft).toContain("TypeScript");
    expect(draft).not.toContain("React\n");
  });
  it("creates interview questions and states unmatched requirements honestly", () => {
    const pack = createInterviewPack(job, facts as never);
    expect(pack.questions).toContain("请结合你的经历说明如何使用 TypeScript");
    expect(pack.gaps).toContain("React：尚无已确认事实可支撑");
  });
});
