import type { FastifyInstance } from "fastify";
import type { ApplicationsService } from "./applications-service.js";

export function registerApplicationsRoutes(app: FastifyInstance, applications: ApplicationsService): void {
  app.get("/api/applications", async () => applications.list());
  app.post("/api/applications", async (request, reply) => reply.code(201).send(applications.create(request.body)));
  app.patch<{ Params: { id: string } }>("/api/applications/:id", async (request) => applications.update(request.params.id, request.body));
  app.get<{ Params: { id: string } }>("/api/applications/:id/events", async (request) => applications.events(request.params.id));
  app.post<{ Params: { id: string } }>("/api/applications/:id/prepare", async (request) => applications.prepare(request.params.id));
  app.get<{ Params: { id: string } }>("/api/applications/:id/resume.pdf", async (request, reply) => {
    const pdf = await applications.resumePdf(request.params.id);
    return reply.type("application/pdf").header("Cache-Control", "no-store").header("Content-Disposition", "attachment; filename=tailored-resume.pdf").send(pdf);
  });
}
