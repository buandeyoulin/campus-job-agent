import Fastify from "fastify";
import { installErrorHandler } from "./errors.js";
import { registerOnboardingRoutes } from "./onboarding-routes.js";
import type { OnboardingService } from "./onboarding-service.js";
import { installOriginGuard } from "./origin-guard.js";
import { registerResumeRoutes, type ResumeRouteDependencies } from "./resume-routes.js";
import { registerJobsRoutes } from "./jobs-routes.js";
import type { JobsService } from "./jobs-service.js";
import { registerMatchingRoutes } from "./matching-routes.js";
import type { MatchService } from "./matching-service.js";
import { registerApplicationsRoutes } from "./applications-routes.js";
import type { ApplicationsService } from "./applications-service.js";
import { registerCompanyDirectoryRoutes } from "./company-directory-routes.js";
import type { CompanyDirectoryService } from "./company-directory-service.js";

export const LOCAL_HOST = "127.0.0.1" as const;
export const API_PORT = 4317;

export interface AppDependencies {
  onboarding?: OnboardingService;
  allowedOrigins: ReadonlySet<string>;
  resumeRoutes?: ResumeRouteDependencies;
  jobs?: JobsService;
  matches?: MatchService;
  applications?: ApplicationsService;
  companies?: CompanyDirectoryService;
}

export function buildApp(dependencies?: AppDependencies) {
  const app = Fastify({ logger: false });
  installErrorHandler(app);
  installOriginGuard(app, dependencies?.allowedOrigins ?? new Set());
  app.get("/api/health", async () => ({ status: "ok" as const }));
  if (dependencies?.onboarding) {
    registerOnboardingRoutes(app, dependencies.onboarding);
    if (dependencies.resumeRoutes) registerResumeRoutes(app, dependencies.resumeRoutes);
  }
  if (dependencies?.jobs) registerJobsRoutes(app, dependencies.jobs);
  if (dependencies?.matches) registerMatchingRoutes(app, dependencies.matches);
  if (dependencies?.applications) registerApplicationsRoutes(app, dependencies.applications);
  if (dependencies?.companies) registerCompanyDirectoryRoutes(app, dependencies.companies);
  return app;
}
