import { API_PORT, buildApp, LOCAL_HOST } from "./app.js";

const app = buildApp();

try {
  await app.listen({ host: LOCAL_HOST, port: API_PORT });
  console.log(`Campus Job Agent API: http://${LOCAL_HOST}:${API_PORT}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
