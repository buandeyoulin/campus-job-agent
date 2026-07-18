import type { FastifyInstance } from "fastify";
import type { MatchService } from "./matching-service.js";

export function registerMatchingRoutes(app: FastifyInstance, matches: MatchService): void {
  app.get("/api/matches", async (request) => matches.list((request.query as { ai?: string }).ai === "true"));
}
