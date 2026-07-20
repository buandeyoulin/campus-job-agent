import { parseStructured, type StructuredAiProvider, type StructuredRequest } from "./types.js";

export interface OpenAiCompatibleOptions { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch }

export class OpenAiCompatibleProvider implements StructuredAiProvider {
  constructor(private readonly options: OpenAiCompatibleOptions) {}

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.options.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI-compatible response contained no message content");
    return parseStructured(content, request.schema);
  }
}
