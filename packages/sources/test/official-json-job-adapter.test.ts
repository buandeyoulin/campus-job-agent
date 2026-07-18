import { describe, expect, it, vi } from "vitest";
import { OfficialJsonJobAdapter } from "../src/index.js";
import type { Company, CompanyCareerSource } from "@campus-job-agent/contracts";

const at = "2026-07-18T08:00:00.000Z";
const company = { id: "018a2c8a-51dc-7a81-a240-000000000021", canonicalName: "JSON Semi" } as Company;
const source = { id: "018a2c8a-51dc-7a81-a240-000000000022", companyId: company.id, canonicalUrl: "https://api.example/jobs", kind: "json_api", adapter: "json-example" } as CompanyCareerSource;

describe("OfficialJsonJobAdapter", () => {
  it("extracts jobs only through an explicit checked-in path mapping", async () => {
    const payload = { data: { positions: [{ req: "r7", name: "DFT Engineer", city: "Shanghai", detail: "Develop scan architecture", apply: "https://api.example/jobs/r7", published: "2026-07-01T00:00:00.000Z" }] } };
    const adapter = new OfficialJsonJobAdapter({
      fetcher: vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })),
      configurations: { "json-example": { items: "data.positions", id: "req", title: "name", location: "city", description: "detail", url: "apply", postedAt: "published", completeness: "complete" } },
    });
    await expect(adapter.fetch(source, { company, capturedAt: at })).resolves.toMatchObject({
      completeness: "complete",
      jobs: [expect.objectContaining({ source: "official-company", sourceJobId: "r7", title: "DFT Engineer", postedAt: "2026-07-01T00:00:00.000Z" })],
    });
  });
});
