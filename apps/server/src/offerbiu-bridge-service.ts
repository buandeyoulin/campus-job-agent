import { randomBytes, timingSafeEqual } from "node:crypto";
import { OfferBiuBridgeSessionSchema, type ScanResult } from "@campus-job-agent/contracts";
import type { JobsService } from "./jobs-service.js";

export class BridgeUnauthorizedError extends Error {
  constructor() {
    super("Invalid bridge token");
    this.name = "BridgeUnauthorizedError";
  }
}

export class OfferBiuBridgeService {
  private readonly token = randomBytes(32).toString("base64url");

  constructor(private readonly jobs: JobsService) {}

  session() {
    return OfferBiuBridgeSessionSchema.parse({ token: this.token });
  }

  import(submittedToken: string | undefined, input: unknown): ScanResult {
    if (!this.matches(submittedToken)) throw new BridgeUnauthorizedError();
    return this.jobs.importOfferBiuBridge(input);
  }

  private matches(submittedToken: string | undefined): boolean {
    if (!submittedToken) return false;
    const expected = Buffer.from(this.token);
    const submitted = Buffer.from(submittedToken);
    return expected.length === submitted.length && timingSafeEqual(expected, submitted);
  }
}
