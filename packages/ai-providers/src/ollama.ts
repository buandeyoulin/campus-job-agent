import { parseStructured, type StructuredAiProvider, type StructuredRequest } from "./types.js";

export interface OllamaOptions { baseUrl: string; model: string; fetchImpl?: typeof fetch }

export class OllamaProvider implements StructuredAiProvider {
  constructor(private readonly options: OllamaOptions) {}

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, stream: false, format: "json", messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}`);
    const payload = await response.json() as { message?: { content?: string } };
    if (!payload.message?.content) throw new Error("Ollama response contained no message content");
    return parseStructured(payload.message.content, request.schema);
  }
}
