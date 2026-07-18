import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyRepository, openDatabase, type StorageDatabase } from "../src/index.js";

const roots: string[] = [];
const storages: StorageDatabase[] = [];

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-job-agent-companies-"));
  roots.push(root);
  const storage = await openDatabase({ dataRoot: root });
  storages.push(storage);
  return new CompanyRepository(storage.db, () => new Date("2026-07-18T08:00:00.000Z"));
}

afterEach(async () => {
  storages.splice(0).forEach((storage) => storage.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("company directory repository", () => {
  it("stores explicit career sites with manual provenance and updates repeats", async () => {
    const repository = await setup();
    const first = repository.upsert({
      companyName: "Example Semiconductor",
      careerUrl: "https://careers.example.com/campus",
      directorySource: "manual",
      directoryUrl: "https://example.com/",
    });
    const second = repository.upsert({
      companyName: "Example Semiconductor",
      careerUrl: "https://careers.example.com/campus",
      directorySource: "manual",
      directoryUrl: "https://example.com/",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(repository.list({ keyword: "Semiconductor", page: 1, pageSize: 20 })).toMatchObject({
      total: 1,
      entries: [expect.objectContaining({ companyName: "Example Semiconductor", status: "pending" })],
    });
  });
});
