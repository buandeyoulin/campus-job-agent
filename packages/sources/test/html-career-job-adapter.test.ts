import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_HTML_CAREER_CONFIGURATIONS, HtmlCareerJobAdapter } from "../src/index.js";
import type { Company, CompanyCareerSource } from "@campus-job-agent/contracts";

const at = "2026-07-18T08:00:00.000Z";
const company = { id: "018a2c8a-51dc-7a81-a240-000000000011", canonicalName: "Static Semi" } as Company;
const source = { id: "018a2c8a-51dc-7a81-a240-000000000012", companyId: company.id, canonicalUrl: "https://static.example/careers", kind: "html", adapter: "static-example", verificationEvidence: [] } as CompanyCareerSource;

describe("HtmlCareerJobAdapter", () => {
  it("uses only checked-in selectors and marks unproven pagination partial", async () => {
    const html = '<ul><li class="job"><a class="title" href="/jobs/42">IC Verification Engineer</a><span class="place">Beijing</span><p class="summary">Create coverage plans</p></li></ul>';
    const adapter = new HtmlCareerJobAdapter({
      fetcher: vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })),
      configurations: { "static-example": { listItem: ".job", title: ".title", link: ".title", location: ".place", description: ".summary", paginationComplete: false } },
    });
    const batch = await adapter.fetch(source, { company, capturedAt: at });
    expect(batch.completeness).toBe("partial");
    expect(batch.jobs).toEqual([expect.objectContaining({ sourceJobId: "https://static.example/jobs/42", sourceUrl: "https://static.example/jobs/42", title: "IC Verification Engineer" })]);
  });

  it("rejects sources without a checked-in selector configuration", async () => {
    const adapter = new HtmlCareerJobAdapter({ fetcher: vi.fn(), configurations: {} });
    await expect(adapter.fetch(source, { company, capturedAt: at })).rejects.toThrow("No static selector configuration");
  });

  it("parses the checked-in S2C official-careers structure as a complete batch", async () => {
    const html = '<ul><li class="t_f4k2li"><a class="t_f4k2name" href="/JobDetail.aspx?id=42">Digital IC Verification Engineer</a><span class="t_f4k2ci">Shanghai</span><div class="t_f4k2lixia">Build UVM environments</div></li></ul>';
    const builtInSource = { ...source, canonicalUrl: "https://www.s2cinc.com.cn/Careers.aspx", adapter: "s2c-careers" } as CompanyCareerSource;
    const adapter = new HtmlCareerJobAdapter({
      fetcher: vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })),
      configurations: BUILT_IN_HTML_CAREER_CONFIGURATIONS,
    });

    await expect(adapter.fetch(builtInSource, { company, capturedAt: at })).resolves.toMatchObject({
      completeness: "complete",
      jobs: [expect.objectContaining({ title: "Digital IC Verification Engineer", location: "Shanghai" })],
    });
  });
});
