import { describe, expect, it } from "vitest";
import {
  CompanyCandidateInputSchema,
  CompanyCareerSourceInputSchema,
  CompanySchema,
} from "../src/index.js";

const evidence = [{
  kind: "official_domain" as const,
  url: "https://example.com/",
  detail: "Seed-reviewed official website",
}];

describe("owned company library contracts", () => {
  it("accepts a verified company with normalized public evidence", () => {
    const company = CompanySchema.parse({
      id: "018a2c8a-51dc-7a81-a240-000000000001",
      canonicalName: "Example Semiconductor",
      aliases: ["Example Semi"],
      officialDomain: "example.com",
      industries: ["chip_design"],
      regions: ["中国"],
      origin: "seed",
      status: "active",
      verificationScore: 100,
      verificationEvidence: evidence,
      verifiedAt: "2026-07-18T08:00:00.000Z",
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
    });

    expect(company.officialDomain).toBe("example.com");
  });

  it("rejects credentials, non-http evidence and non-normalized domains", () => {
    expect(() => CompanyCandidateInputSchema.parse({
      canonicalName: "Unsafe candidate",
      candidateDomain: "WWW.Example.com/path",
      homepageUrl: "https://user:secret@example.com/",
      origin: "discovery",
      evidence,
    })).toThrow();

    expect(() => CompanyCareerSourceInputSchema.parse({
      canonicalUrl: "file:///tmp/jobs.json",
      kind: "json_api",
      adapter: "generic-json",
    })).toThrow();
  });

  it("rejects arbitrary evidence fields", () => {
    expect(() => CompanyCandidateInputSchema.parse({
      canonicalName: "Example",
      candidateDomain: "example.com",
      homepageUrl: "https://example.com/",
      origin: "manual",
      evidence: [{ ...evidence[0], cookie: "secret" }],
    })).toThrow();
  });
});
