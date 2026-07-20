import { describe, expect, it } from "vitest";
import { createInterviewPack, createTailoredResumeDraft } from "../src/index.js";

const job = { title: "数字 IC 验证工程师", company: "示例芯片", description: "需要 UVM、SystemVerilog 和形式验证经验" };
const facts = [
  { status: "confirmed" as const, content: { type: "skill", name: "UVM", evidence: "完成覆盖率收敛" } },
  { status: "pending" as const, content: { type: "skill", name: "SystemVerilog", evidence: "" } },
];

describe("application preparation", () => {
  it("creates a tailored resume draft from confirmed facts only", () => {
    const draft = createTailoredResumeDraft(job, facts);
    expect(draft).toContain("UVM：完成覆盖率收敛");
    expect(draft).not.toContain("SystemVerilog");
  });
  it("creates interview questions and states unmatched requirements honestly", () => {
    const pack = createInterviewPack(job, facts);
    expect(pack.questions).toContain("请结合你的经历说明如何使用 UVM");
    expect(pack.gaps).toContain("SystemVerilog：尚无已确认事实可支撑");
    expect(pack.gaps).toContain("形式验证：尚无已确认事实可支撑");
  });
});
