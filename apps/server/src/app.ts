import Fastify from "fastify";
import { installErrorHandler } from "./errors.js";
import { registerOnboardingRoutes } from "./onboarding-routes.js";
import type { OnboardingService } from "./onboarding-service.js";
import { installOriginGuard } from "./origin-guard.js";

export const LOCAL_HOST = "127.0.0.1" as const;
export const API_PORT = 4317;

export interface AppDependencies {
  onboarding: OnboardingService;
  allowedOrigins: ReadonlySet<string>;
}

export function buildApp(dependencies?: AppDependencies) {
  const app = Fastify({ logger: false });
  installErrorHandler(app);
  installOriginGuard(app, dependencies?.allowedOrigins ?? new Set());
  app.get("/api/health", async () => ({ status: "ok" as const }));
  if (dependencies) registerOnboardingRoutes(app, dependencies.onboarding);
  return app;
}
