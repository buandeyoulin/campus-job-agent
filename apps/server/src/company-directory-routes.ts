import type { FastifyInstance } from "fastify";
import { CompanyDirectoryService } from "./company-directory-service.js";

export function registerCompanyDirectoryRoutes(app: FastifyInstance, companies: CompanyDirectoryService): void {
  app.get("/api/companies", async (request) => companies.list(request.query));
  app.post("/api/companies/discover", async (request) => companies.discover(request.body));
}
