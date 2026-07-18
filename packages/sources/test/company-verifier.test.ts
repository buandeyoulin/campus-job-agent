import { describe, expect, it, vi } from "vitest";
import type { CompanyCandidate } from "@campus-job-agent/contracts";
import { verifyCareerSourceForCompany, verifyCompanyCandidate } from "../src/index.js";

const candidate: CompanyCandidate = {
  id: "018a2c8a-51dc-7a81-a240-000000000001",
  canonicalName: "Example Semiconductor",
  normalizedName: "example semiconductor",
  candidateDomain: "example.com",
  homepageUrl: "https://example.com/",
  origin: "discovery",
  status: "pending",
  verificationScore: 0,
  evidence: [],
  failureReason: null,
  retryCount: 0,
  nextRetryAt: null,
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

function response(url: string, body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } }) as Response & { url: string };
}

describe("company candidate verifier", () => {
  it("verifies an identity-matching HTTPS homepage with a same-domain career link", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/careers")) return response(value, "<html><title>Example Semiconductor Careers</title><body>Open positions</body></html>");
      return response(value, '<html><head><title>Example Semiconductor</title></head><body><a href="/careers">Careers</a></body></html>');
    });

    await expect(verifyCompanyCandidate(candidate, { fetcher })).resolves.toMatchObject({
      status: "verified",
      score: 100,
      officialDomain: "example.com",
      careerSources: [expect.objectContaining({ url: "https://example.com/careers" })],
    });
  });

  it("quarantines an external ATS URL that the official homepage does not link", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => response(String(url), "<html><title>Example Semiconductor</title><body>Products</body></html>"));
    const decision = await verifyCompanyCandidate(candidate, { fetcher, proposedCareerUrls: ["https://jobs.lever.co/example"] });
    expect(decision.status).toBe("quarantined");
    expect(decision.careerSources).toHaveLength(0);
  });

  it("hard rejects aggregate recruitment sites", async () => {
    const aggregateCandidate = { ...candidate, candidateDomain: "zhipin.com", homepageUrl: "https://www.zhipin.com/" };
    const fetcher = vi.fn();
    const decision = await verifyCompanyCandidate(aggregateCandidate, { fetcher });
    expect(decision).toMatchObject({ status: "rejected", score: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts a manually proposed career entry only when the verified homepage links it", async () => {
    const company = {
      id: candidate.id, canonicalName: candidate.canonicalName, aliases: [], officialDomain: candidate.candidateDomain,
      industries: [], regions: [], origin: "manual" as const, status: "active" as const, verificationScore: 90,
      verificationEvidence: [], verifiedAt: candidate.createdAt, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt,
    };
    const fetcher = vi.fn(async (url: string | URL | Request) => response(String(url), "<html><title>Example Semiconductor</title><body>Products</body></html>"));
    await expect(verifyCareerSourceForCompany(company, "https://example.com/unlinked-jobs", { fetcher })).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
