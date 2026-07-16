import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider, OllamaProvider } from "../src/index.js";

const schema = z.object({ ok: z.literal(true), label: z.string() });

describe("structured AI providers", () => {
  it("validates OpenAI-compatible JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true,\"label\":\"cloud\"}" } }] }), { status: 200 })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider({ baseUrl: "https://api.example.com/v1", apiKey: "secret-value", model: "test", fetchImpl });
    await expect(provider.generate({ system: "Return JSON", prompt: "ping", schema })).resolves.toEqual({ ok: true, label: "cloud" });
  });

  it("validates Ollama JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: { content: "{\"ok\":true,\"label\":\"local\"}" } }), { status: 200 })) as unknown as typeof fetch;
    const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", model: "test", fetchImpl });
    await expect(provider.generate({ system: "Return JSON", prompt: "ping", schema })).resolves.toEqual({ ok: true, label: "local" });
  });

  it("never includes the API key in HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 401 })) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleProvider({ baseUrl: "https://api.example.com/v1", apiKey: "secret-value", model: "test", fetchImpl });
    await expect(provider.generate({ system: "x", prompt: "y", schema })).rejects.not.toThrow(/secret-value/);
  });
});
