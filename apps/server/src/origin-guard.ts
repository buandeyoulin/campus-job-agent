import type { FastifyInstance } from "fastify";
import { ApiFailure } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function installOriginGuard(
  app: FastifyInstance,
  allowedOrigins: ReadonlySet<string>,
): void {
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (!origin || origin === "null" || !allowedOrigins.has(origin)) {
      throw new ApiFailure(403, "origin_not_allowed", "请求来源不受信任");
    }
  });
}
