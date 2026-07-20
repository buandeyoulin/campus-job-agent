import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  CODEX_CLIENT_OPTIONS,
  CODEX_THREAD_POLICY,
  CodexProvider,
  createSdkRun,
  OpenAiCompatibleProvider,
  OllamaProvider,
  type CodexRun,
} from "../src/index.js";

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

describe("Codex structured provider", () => {
  it("uses isolated policy, JSON Schema, and Zod revalidation", async () => {
    const run = vi.fn<CodexRun>(async () => "{\"ok\":true,\"label\":\"codex\"}");
    const provider = new CodexProvider({ workingDirectory: "C:/isolated/codex-runtime", run });

    await expect(provider.generate({ system: "Return JSON", prompt: "ping", schema })).resolves.toEqual({ ok: true, label: "codex" });

    expect(CODEX_CLIENT_OPTIONS).toEqual({ config: { history: { persistence: "none" } } });
    expect(CODEX_THREAD_POLICY).toEqual({ sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false, webSearchMode: "disabled" });
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("Do not inspect files, run commands, modify files, or use network tools."),
      expect.objectContaining({
        workingDirectory: "C:/isolated/codex-runtime",
        outputSchema: expect.objectContaining({
          type: "object",
          required: ["ok", "label"],
          additionalProperties: false,
        }),
      }),
    );
  });

  it("starts a fresh SDK thread with the isolated policy", async () => {
    const threadRun = vi.fn(async () => ({ finalResponse: "{\"ok\":true}" }));
    const startThread = vi.fn(() => ({ run: threadRun }));
    const run = createSdkRun({ startThread });

    await expect(run("input", { workingDirectory: "C:/isolated/codex-runtime", outputSchema: { type: "object" } })).resolves.toBe("{\"ok\":true}");
    await expect(run("input", { workingDirectory: "C:/isolated/codex-runtime", outputSchema: { type: "object" } })).resolves.toBe("{\"ok\":true}");
    expect(startThread).toHaveBeenCalledTimes(2);
    expect(startThread).toHaveBeenCalledWith({
      ...CODEX_THREAD_POLICY,
      workingDirectory: "C:/isolated/codex-runtime",
    });
    expect(threadRun).toHaveBeenCalledWith("input", { outputSchema: { type: "object" } });
  });

  it("rejects empty Codex output with a sanitized error", async () => {
    const run = vi.fn<CodexRun>(async () => "  ");
    const provider = new CodexProvider({ workingDirectory: "C:/isolated/codex-runtime", run });
    await expect(provider.generate({ system: "x", prompt: "y", schema })).rejects.toThrow("Codex response contained no final content");
  });

  it("does not echo invalid model content in JSON or schema errors", async () => {
    const privateValue = "private-resume-content";
    const invalidJson = new CodexProvider({ workingDirectory: "C:/isolated/codex-runtime", run: async () => privateValue });
    await expect(invalidJson.generate({ system: "x", prompt: "y", schema })).rejects.toThrow("AI provider returned invalid JSON");
    await expect(invalidJson.generate({ system: "x", prompt: "y", schema })).rejects.not.toThrow(privateValue);

    const invalidSchema = new CodexProvider({ workingDirectory: "C:/isolated/codex-runtime", run: async () => JSON.stringify({ ok: false, label: privateValue }) });
    await expect(invalidSchema.generate({ system: "x", prompt: "y", schema })).rejects.toThrow("AI provider returned schema-invalid JSON");
    await expect(invalidSchema.generate({ system: "x", prompt: "y", schema })).rejects.not.toThrow(privateValue);
  });

  it("maps SDK failures to a stable message without exposing the cause", async () => {
    const run = vi.fn<CodexRun>(async () => { throw new Error("C:/Users/name/.codex token private-value"); });
    const provider = new CodexProvider({ workingDirectory: "C:/isolated/codex-runtime", run });
    await expect(provider.generate({ system: "x", prompt: "y", schema })).rejects.toThrow("Codex runtime could not complete structured generation");
    await expect(provider.generate({ system: "x", prompt: "y", schema })).rejects.not.toThrow(/private-value|C:\/Users/);
  });
});
