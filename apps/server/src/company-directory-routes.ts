import type { FastifyInstance } from "fastify";
import { ApiFailure } from "./errors.js";
import { CompanyDirectoryService, CompanyDirectoryUnavailableError } from "./company-directory-service.js";

export function registerCompanyDirectoryRoutes(app: FastifyInstance, companies: CompanyDirectoryService): void {
  app.get("/api/companies", async (request) => companies.list(request.query));
  app.post("/api/companies/scan/offerbiu", async () => {
    try {
      return await companies.scanOfferBiu();
    } catch (error) {
      if (error instanceof CompanyDirectoryUnavailableError) {
        throw new ApiFailure(502, "company_directory_unavailable", "Public company directory is unavailable");
      }
      throw error;
    }
  });
}
