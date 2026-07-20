import type { FastifyInstance } from "fastify";
import type { OnboardingService } from "./onboarding-service.js";

interface FactParams {
  id: string;
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  onboarding: OnboardingService,
): void {
  app.get("/api/onboarding", async () => onboarding.getSnapshot());
  app.put("/api/profile", async (request) => onboarding.saveProfile(request.body));
  app.put("/api/preferences", async (request) => onboarding.savePreferences(request.body));
  app.post("/api/facts", async (request, reply) => (
    reply.code(201).send(onboarding.createFact(request.body))
  ));
  app.post("/api/facts/confirm-batch", async (request) => onboarding.confirmFacts(request.body));
  app.patch<{ Params: FactParams }>("/api/facts/:id", async (request) => (
    onboarding.updateFact(request.params.id, request.body)
  ));
  app.post<{ Params: FactParams }>("/api/facts/:id/confirm", async (request) => (
    onboarding.confirmFact(request.params.id)
  ));
  app.post<{ Params: FactParams }>("/api/facts/:id/reject", async (request) => (
    onboarding.rejectFact(request.params.id)
  ));
  app.delete<{ Params: FactParams }>("/api/facts/:id", async (request, reply) => {
    onboarding.deleteFact(request.params.id);
    return reply.code(204).send();
  });
}
