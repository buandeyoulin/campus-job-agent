import { describe, expect, it } from "vitest";
import { classifyOfferBiuMetrics } from "../src/offerbiu.js";

describe("OfferBiu public feasibility", () => {
  it("marks the current zero-record public view unsupported", () => {
    const result = classifyOfferBiuMetrics("已收录公司 0 校招信息 0 可投岗位 0", "2026-07-16T00:00:00.000Z");
    expect(result.status).toBe("fail");
    expect(result.details.publicJobCount).toBe(0);
  });

  it("marks visible public job records supported", () => {
    const result = classifyOfferBiuMetrics("已收录公司 12 校招信息 68 可投岗位 31", "2026-07-16T00:00:00.000Z");
    expect(result.status).toBe("pass");
    expect(result.details.publicJobCount).toBe(68);
  });
});
