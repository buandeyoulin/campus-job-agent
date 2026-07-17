import type { FastifyInstance } from "fastify";
import type { ApplicationsService } from "./applications-service.js";

export function registerApplicationsRoutes(app: FastifyInstance, applications: ApplicationsService): void {
  app.post("/api/applications", async (request, reply) => reply.code(201).send(applications.create(request.body)));
  app.patch<{ Params: { id: string } }>("/api/applications/:id", async (request) => applications.update(request.params.id, request.body));
}
