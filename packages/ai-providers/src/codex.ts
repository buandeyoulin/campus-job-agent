import { Codex, type ThreadOptions, type TurnOptions } from "@openai/codex-sdk";
import { toJSONSchema } from "zod";
import { parseStructured, type StructuredAiProvider, type StructuredRequest } from "./types.js";

export const CODEX_CLIENT_OPTIONS = {
  config: { history: { persistence: "none" } },
} as const;

export const CODEX_THREAD_POLICY = {
  sandboxMode: "read-only",
  approvalPolicy: "never",
  networkAccessEnabled: false,
  webSearchMode: "disabled",
} as const;

export interface CodexRunOptions {
  workingDirectory: string;
  outputSchema: unknown;
}

export type CodexRun = (input: string, options: CodexRunOptions) => Promise<string>;

export interface CodexProviderOptions {
  workingDirectory: string;
  run?: CodexRun;
}

export interface CodexClientLike {
  startThread(options?: ThreadOptions): {
    run(input: string, options?: TurnOptions): Promise<{ finalResponse: string }>;
  };
}

export function createSdkRun(client: CodexClientLike = new Codex(CODEX_CLIENT_OPTIONS)): CodexRun {
  return async (input, options) => {
    const thread = client.startThread({
      ...CODEX_THREAD_POLICY,
      workingDirectory: options.workingDirectory,
    });
    const turn = await thread.run(input, { outputSchema: options.outputSchema });
    return turn.finalResponse;
  };
}

export class CodexProvider implements StructuredAiProvider {
  private readonly run: CodexRun;

  constructor(private readonly options: CodexProviderOptions) {
    this.run = options.run ?? createSdkRun();
  }

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const input = [
      "System instructions:",
      request.system,
      "",
      "Task:",
      request.prompt,
      "",
      "Return only JSON matching the supplied schema.",
      "Do not inspect files, run commands, modify files, or use network tools.",
      "Use only the text provided in this request.",
    ].join("\n");

    let content: string;
    try {
      content = await this.run(input, {
        workingDirectory: this.options.workingDirectory,
        outputSchema: toJSONSchema(request.schema, { target: "draft-07" }),
      });
    } catch {
      throw new Error("Codex runtime could not complete structured generation");
    }

    if (!content.trim()) throw new Error("Codex response contained no final content");
    return parseStructured(content, request.schema);
  }
}
