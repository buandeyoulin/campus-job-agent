import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyDirectoryListSchema } from "@campus-job-agent/contracts";
import { CompanyRepository, openDatabase, type StorageDatabase } from "@campus-job-agent/storage";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { CompanyDirectoryService } from "../src/company-directory-service.js";

const ORIGIN = "http://127.0.0.1:4318";
const roots: string[] = [];
const storages: StorageDatabase[] = [];
const apps: FastifyInstance[] = [];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-company-api-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  const companies = new CompanyDirectoryService({
    repository: new CompanyRepository(storage.db),
    fetchOfferBiu: async () => [{
      companyName: "Example Semiconductor",
      careerUrl: "https://careers.example.com/campus",
      directorySource: "offerbiu",
      directoryUrl: "https://offerbiu.com/companies/",
    }],
  });
  const app = buildApp({ companies, allowedOrigins: new Set([ORIGIN]) });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("company directory routes", () => {
  it("scans OfferBiu directory entries and lists the local records", async () => {
    const app = await setup();
    const scan = await app.inject({ method: "POST", url: "/api/companies/scan/offerbiu", headers: { origin: ORIGIN } });
    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toMatchObject({ source: "offerbiu", fetched: 1, created: 1 });

    const listed = await app.inject({ method: "GET", url: "/api/companies?keyword=Semiconductor" });
    expect(CompanyDirectoryListSchema.parse(listed.json())).toMatchObject({ total: 1 });
  });
});
