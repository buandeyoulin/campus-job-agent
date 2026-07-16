import fixture from "./fixtures/tencent.json";
import { describe, expect, it, vi } from "vitest";
import { parseTencentResponse, probeTencent } from "../src/tencent.js";

describe("Tencent public source", () => {
  it("normalizes the public API response and upgrades the URL to HTTPS", () => {
    const jobs = parseTencentResponse(fixture, "2026-07-16T00:00:00.000Z");
    expect(jobs).toEqual([expect.objectContaining({
      source: "tencent",
      sourceJobId: "123",
      sourceUrl: "https://careers.tencent.com/jobdesc.html?postId=123",
      title: "软件开发实习生",
      location: "深圳"
    })]);
  });

  it("returns a failed probe instead of throwing when the API is unavailable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const result = await probeTencent(fetchImpl, () => new Date("2026-07-16T00:00:00.000Z"));
    expect(result.status).toBe("fail");
    expect(result.summary).toBe("Tencent public API request failed");
  });
});
