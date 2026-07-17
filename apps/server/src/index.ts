import { API_PORT, buildApp, LOCAL_HOST } from "./app.js";
import { createProductionServices } from "./services.js";

const services = await createProductionServices();
const app = buildApp({
  onboarding: services.onboarding,
  jobs: services.jobs,
  matches: services.matches,
  applications: services.applications,
  companies: services.companies,
  allowedOrigins: new Set([
    "http://127.0.0.1:4318",
    "http://127.0.0.1:4317",
  ]),
  resumeRoutes: services.resumeRoutes,
});
app.addHook("onClose", async () => services.close());

try {
  await app.listen({ host: LOCAL_HOST, port: API_PORT });
  console.log(`Campus Job Agent API: http://${LOCAL_HOST}:${API_PORT}`);
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
