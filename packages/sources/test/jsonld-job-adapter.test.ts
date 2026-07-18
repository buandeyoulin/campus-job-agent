import { describe, expect, it, vi } from "vitest";
import { JsonLdJobAdapter } from "../src/index.js";
import type { Company, CompanyCareerSource } from "@campus-job-agent/contracts";

const at = "2026-07-18T08:00:00.000Z";
const company = { id: "018a2c8a-51dc-7a81-a240-000000000001", canonicalName: "Example Semiconductor" } as Company;
const source = { id: "018a2c8a-51dc-7a81-a240-000000000002", companyId: company.id, canonicalUrl: "https://example.com/careers", kind: "json_ld", adapter: "json-ld" } as CompanyCareerSource;

describe("JsonLdJobAdapter", () => {
  it("extracts JobPosting objects from objects, arrays and @graph while skipping unrelated data", async () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","name":"Ignore"}</script>
      <script type="application/ld+json">[{"@type":"JobPosting","identifier":{"value":"j1"},"title":"Verification Engineer","description":"Build UVM environments","url":"https://example.com/jobs/j1","jobLocation":{"address":{"addressLocality":"Shanghai"}}},{"@graph":[{"@type":"JobPosting","identifier":"j2","title":"RTL Engineer","description":"Design RTL","url":"https://example.com/jobs/j2"}]}]</script>`;
    const adapter = new JsonLdJobAdapter({ fetcher: vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) });
    const batch = await adapter.fetch(source, { company, capturedAt: at });
    expect(batch.completeness).toBe("complete");
    expect(batch.jobs).toHaveLength(2);
    expect(batch.jobs[0]).toMatchObject({ source: "official-company", sourceJobId: "j1", title: "Verification Engineer", company: "Example Semiconductor", location: "Shanghai" });
  });
});
