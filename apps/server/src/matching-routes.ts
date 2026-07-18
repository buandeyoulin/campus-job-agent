import type { FastifyInstance } from "fastify";
import type { MatchService } from "./matching-service.js";

export function registerMatchingRoutes(app: FastifyInstance, matches: MatchService): void {
  app.get("/api/matches", async () => matches.list(false));
  app.post("/api/matches/analyze", async () => matches.list(true));
}
