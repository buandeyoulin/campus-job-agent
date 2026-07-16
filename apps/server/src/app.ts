import Fastify from "fastify";

export const LOCAL_HOST = "127.0.0.1" as const;
export const API_PORT = 4317;

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" as const }));
  return app;
}
