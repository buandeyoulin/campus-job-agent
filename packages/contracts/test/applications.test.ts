import { describe, expect, it } from "vitest";
import { ApplicationCreateSchema, ApplicationStatusSchema, ApplicationUpdateSchema } from "../src/index.js";

describe("manual application tracking contracts", () => {
  it("creates an application only from an existing local job id", () => {
    expect(ApplicationCreateSchema.parse({ jobId: "018a2c8a-51dc-7a81-a240-000000000001" })).toEqual({ jobId: "018a2c8a-51dc-7a81-a240-000000000001" });
  });

  it("allows a manual progress update but rejects automatic-submission fields", () => {
    expect(ApplicationUpdateSchema.parse({ status: "applied", note: "已在官网手动投递" })).toMatchObject({ status: "applied" });
    expect(() => ApplicationStatusSchema.parse("submitted_automatically")).toThrow();
  });
});
