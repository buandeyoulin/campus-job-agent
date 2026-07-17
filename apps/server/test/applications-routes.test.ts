import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("application routes", () => {
  it("creates an application only after an allowed local-origin request", async () => {
    const app = buildApp({ allowedOrigins: new Set(["http://127.0.0.1:4318"]), applications: { create: () => ({ id: "018a2c8a-51dc-7a81-a240-000000000002", jobId: "018a2c8a-51dc-7a81-a240-000000000001", status: "saved", note: "", createdAt: "2026-07-17T10:00:00.000Z", updatedAt: "2026-07-17T10:00:00.000Z" }), update: () => { throw new Error("not reached"); } } as never });
    const response = await app.inject({ method: "POST", url: "/api/applications", headers: { origin: "http://127.0.0.1:4318" }, payload: { jobId: "018a2c8a-51dc-7a81-a240-000000000001" } });
    expect(response.statusCode).toBe(201);
    await app.close();
  });
});
