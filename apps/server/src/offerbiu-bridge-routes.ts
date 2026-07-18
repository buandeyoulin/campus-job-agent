import type { FastifyInstance } from "fastify";
import { ApiFailure } from "./errors.js";
import { BridgeUnauthorizedError, type OfferBiuBridgeService } from "./offerbiu-bridge-service.js";

export const OFFERBIU_BRIDGE_IMPORT_PATH = "/api/jobs/import/offerbiu-bridge";

export function registerOfferBiuBridgeRoutes(app: FastifyInstance, bridge: OfferBiuBridgeService): void {
  app.get("/api/offerbiu-bridge/session", async () => bridge.session());
  app.post(OFFERBIU_BRIDGE_IMPORT_PATH, async (request, reply) => {
    const header = request.headers["x-campus-bridge-token"];
    const token = typeof header === "string" ? header : undefined;
    try {
      return reply.code(201).send(bridge.import(token, request.body));
    } catch (error) {
      if (error instanceof BridgeUnauthorizedError) {
        throw new ApiFailure(401, "bridge_unauthorized", "本机桥接授权无效");
      }
      throw error;
    }
  });
}
