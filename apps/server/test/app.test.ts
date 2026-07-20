import { afterEach, describe, expect, it } from "vitest";
import { buildApp, LOCAL_HOST } from "../src/app.js";

describe("local server", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];
  afterEach(async () => Promise.all(apps.map((app) => app.close())));

  it("returns a minimal health response", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("exports the loopback-only default host", () => {
    expect(LOCAL_HOST).toBe("127.0.0.1");
  });
});
