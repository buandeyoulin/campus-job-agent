import type { FastifyInstance } from "fastify";
import { CompanyDirectoryService } from "./company-directory-service.js";

export function registerCompanyDirectoryRoutes(app: FastifyInstance, companies: CompanyDirectoryService): void {
  app.get("/api/companies", async (request) => companies.list(request.query));
  app.get("/api/company-candidates", async (request) => companies.listCandidates(request.query));
  app.get("/api/companies/:id/career-sources", async (request) => companies.listCareerSources((request.params as { id: string }).id));
  app.post("/api/companies", async (request) => companies.addCompany(request.body));
  app.post("/api/companies/:id/career-sources", async (request) => companies.addCareerSource((request.params as { id: string }).id, request.body));
  app.post("/api/companies/seed/import", async () => companies.importSeed());
  app.post("/api/companies/discover", async (request) => companies.discover(request.body));
}
