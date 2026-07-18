import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyListSchema, type CompanyCandidate } from "@campus-job-agent/contracts";
import { CompanyRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { CompanyDirectoryService } from "../src/company-directory-service.js";
import type { CompanyDiscoveryProvider, VerificationCareerSource, VerificationDecision } from "@campus-job-agent/sources";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];

interface SetupOptions {
  verifyCandidate?: (candidate: CompanyCandidate) => Promise<VerificationDecision>;
  verifyCareerSource?: (company: import("@campus-job-agent/contracts").Company, url: string) => Promise<VerificationCareerSource | null>;
  discoveryProvider?: CompanyDiscoveryProvider;
}

async function setup(options: SetupOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const repository = new CompanyRepository(storage.db, () => new Date("2026-07-18T08:00:00.000Z"));
  const companies = new CompanyDirectoryService({ repository, ...options, now: () => new Date("2026-07-18T08:00:00.000Z") });
  const app = buildApp({ companies, allowedOrigins: new Set([ORIGIN]) });
  apps.push(app);
  return { app, companies, repository };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("company directory routes", () => {
  it("returns discovery_not_configured without a discovery provider", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { app } = await setup();
    const response = await app.inject({ method: "POST", url: "/api/companies/discover", headers: { origin: ORIGIN }, payload: {} });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "discovery_not_configured" } });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it("returns 404 for an unknown company-directory scan", async () => {
    const { app } = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/companies/scan/unknown-source", headers: { origin: ORIGIN } });
    expect(scan.statusCode).toBe(404);

    const listed = await app.inject({ method: "GET", url: "/api/companies?keyword=Semiconductor" });
    expect(CompanyListSchema.parse(listed.json())).toMatchObject({ total: 0 });
  });

  it("imports the reviewed seed idempotently and exposes 20 active companies", async () => {
    const { app } = await setup();
    const first = await app.inject({ method: "POST", url: "/api/companies/seed/import", headers: { origin: ORIGIN }, payload: {} });
    const second = await app.inject({ method: "POST", url: "/api/companies/seed/import", headers: { origin: ORIGIN }, payload: {} });
    expect(first.json()).toMatchObject({ fetched: 20, created: 20, updated: 0 });
    expect(second.json()).toMatchObject({ fetched: 20, created: 0, updated: 20 });

    const listed = await app.inject({ method: "GET", url: "/api/companies?status=active&pageSize=100" });
    const result = CompanyListSchema.parse(listed.json());
    expect(result.total).toBe(20);
    expect(result.companies.every((company) => company.origin === "seed" && company.verificationScore === 100)).toBe(true);
  });

  it("lists candidates and routes manual companies through verification", async () => {
    const verification: VerificationDecision = {
      status: "quarantined", score: 55, canonicalName: "Manual Semi", officialDomain: "manual.example",
      evidence: [{ kind: "official_domain", url: "https://manual.example/", detail: "Reachable" }],
      failureReason: "missing recruiting evidence", careerSources: [],
    };
    const { app } = await setup({ verifyCandidate: async () => verification });
    const added = await app.inject({ method: "POST", url: "/api/companies", headers: { origin: ORIGIN }, payload: { canonicalName: "Manual Semi", homepageUrl: "https://manual.example/" } });
    expect(added.statusCode).toBe(200);
    expect(added.json()).toMatchObject({ candidate: { status: "quarantined", candidateDomain: "manual.example" }, verification: { processed: 1, quarantined: 1 } });
    const listed = await app.inject({ method: "GET", url: "/api/company-candidates?status=quarantined" });
    expect(listed.json()).toMatchObject({ total: 1, candidates: [{ canonicalName: "Manual Semi" }] });
  });

  it("accepts only verified career entries for an existing verified company", async () => {
    const verifiedSource: VerificationCareerSource = {
      url: "https://verified.example/careers", kind: "html", adapter: "verified-static",
      evidence: [{ kind: "homepage_link", url: "https://verified.example/", detail: "Linked from official homepage" }],
    };
    const { app, repository } = await setup({ verifyCareerSource: async (_company, url) => url.endsWith("/careers") ? verifiedSource : null });
    const company = repository.upsertSeed({ canonicalName: "Verified Semi", aliases: [], officialDomain: "verified.example", industries: ["chip_design"], regions: ["China"], verificationEvidence: [{ kind: "official_domain", url: "https://verified.example/", detail: "Official" }] }).company;

    const rejected = await app.inject({ method: "POST", url: `/api/companies/${company.id}/career-sources`, headers: { origin: ORIGIN }, payload: { canonicalUrl: "https://evil.example/jobs" } });
    expect(rejected.statusCode).toBe(422);
    const accepted = await app.inject({ method: "POST", url: `/api/companies/${company.id}/career-sources`, headers: { origin: ORIGIN }, payload: { canonicalUrl: "https://verified.example/careers" } });
    expect(accepted.json()).toMatchObject({ source: { companyId: company.id, canonicalUrl: "https://verified.example/careers" }, created: true });
    const listed = await app.inject({ method: "GET", url: `/api/companies/${company.id}/career-sources` });
    expect(listed.json()).toHaveLength(1);
  });

  it("promotes only verified candidates and isolates inconclusive candidates", async () => {
    const evidence = [{ kind: "official_domain" as const, url: "https://verified.example/", detail: "Verified official site" }];
    const decisions = new Map<string, VerificationDecision>([
      ["verified.example", { status: "verified", score: 95, canonicalName: "Verified Semi", officialDomain: "verified.example", evidence,
        failureReason: null, careerSources: [{ url: "https://verified.example/careers", kind: "html", adapter: "unclassified", evidence }] }],
      ["quarantine.example", { status: "quarantined", score: 60, canonicalName: "Needs Review", officialDomain: "quarantine.example", evidence,
        failureReason: "missing careers link", careerSources: [] }],
      ["rejected.example", { status: "rejected", score: 0, canonicalName: "Rejected", officialDomain: "rejected.example", evidence,
        failureReason: "conflicting company identity", careerSources: [] }],
    ]);
    const { companies, repository } = await setup({ verifyCandidate: async (candidate) => decisions.get(candidate.candidateDomain)! });
    repository.upsertCandidate({ canonicalName: "Verified Semi", candidateDomain: "verified.example", homepageUrl: "https://verified.example/", origin: "discovery", evidence });
    repository.upsertCandidate({ canonicalName: "Needs Review", candidateDomain: "quarantine.example", homepageUrl: "https://quarantine.example/", origin: "discovery", evidence });
    repository.upsertCandidate({ canonicalName: "Rejected", candidateDomain: "rejected.example", homepageUrl: "https://rejected.example/", origin: "discovery", evidence });

    await expect(companies.verifyPendingCandidates()).resolves.toMatchObject({ processed: 3, verified: 1, quarantined: 1, rejected: 1 });
    const verified = repository.listCompanies({ keyword: "Verified", industry: "", region: "", status: "active", page: 1, pageSize: 20 }).companies[0]!;
    expect(repository.listCareerSources(verified.id)).toHaveLength(1);
    expect(repository.listCandidates({ keyword: "Needs Review", industry: "", region: "", status: "quarantined", page: 1, pageSize: 20 }).candidates[0])
      .toMatchObject({ retryCount: 1, nextRetryAt: "2026-07-18T14:00:00.000Z" });
    expect(repository.listCandidates({ keyword: "Rejected", industry: "", region: "", status: "rejected", page: 1, pageSize: 20 }).candidates[0])
      .toMatchObject({ failureReason: "conflicting company identity", nextRetryAt: null });
  });

  it("deduplicates discovery results, verifies candidates, and never returns provider secrets", async () => {
    const secret = "route-secret-never-returned";
    const discoveryProvider: CompanyDiscoveryProvider = {
      discover: vi.fn(async (queries) => [
        { query: queries[0]!, title: "Discovered Semiconductor Careers", url: "https://discovered.example/careers", snippet: "Official jobs" },
        { query: queries[0]!, title: "Duplicate", url: "https://discovered.example/careers", snippet: "Duplicate" },
      ]),
    };
    const verification: VerificationDecision = {
      status: "verified", score: 90, canonicalName: "Discovered Semiconductor", officialDomain: "discovered.example",
      evidence: [{ kind: "official_domain", url: "https://discovered.example/", detail: "Verified" }], failureReason: null,
      careerSources: [{ url: "https://discovered.example/careers", kind: "html", adapter: "unclassified", evidence: [] }],
    };
    const { app, repository } = await setup({ discoveryProvider, verifyCandidate: async () => verification });
    const response = await app.inject({ method: "POST", url: "/api/companies/discover", headers: { origin: ORIGIN }, payload: { queries: ["chip careers"] } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ searched: 1, candidatesCreated: 1, candidatesUpdated: 0, verified: 1, quarantined: 0, rejected: 0 });
    expect(response.body).not.toContain(secret);
    expect(repository.listCandidates({ keyword: "Discovered", industry: "", region: "", status: "verified", page: 1, pageSize: 20 }).total).toBe(1);
  });
});
