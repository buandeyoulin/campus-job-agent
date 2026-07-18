import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyListSchema } from "@campus-job-agent/contracts";
import { CompanyRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { CompanyDirectoryService } from "../src/company-directory-service.js";
import type { VerificationDecision } from "@campus-job-agent/sources";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];

async function setup(verifyCandidate?: (candidate: any) => Promise<VerificationDecision>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const repository = new CompanyRepository(storage.db, () => new Date("2026-07-18T08:00:00.000Z"));
  const companies = new CompanyDirectoryService({ repository, verifyCandidate, now: () => new Date("2026-07-18T08:00:00.000Z") });
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
  it("returns 404 for an unknown company-directory scan", async () => {
    const { app } = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/companies/scan/unknown-source", headers: { origin: ORIGIN } });
    expect(scan.statusCode).toBe(404);

    const listed = await app.inject({ method: "GET", url: "/api/companies?keyword=Semiconductor" });
    expect(CompanyListSchema.parse(listed.json())).toMatchObject({ total: 0 });
  });

  it("imports the reviewed seed idempotently and exposes 20 active companies", async () => {
    const { app, companies } = await setup();
    expect(companies.importSeed()).toMatchObject({ fetched: 20, created: 20, updated: 0 });
    expect(companies.importSeed()).toMatchObject({ fetched: 20, created: 0, updated: 20 });

    const listed = await app.inject({ method: "GET", url: "/api/companies?status=active&pageSize=100" });
    const result = CompanyListSchema.parse(listed.json());
    expect(result.total).toBe(20);
    expect(result.companies.every((company) => company.origin === "seed" && company.verificationScore === 100)).toBe(true);
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
    const { companies, repository } = await setup(async (candidate) => decisions.get(candidate.candidateDomain)!);
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
});
