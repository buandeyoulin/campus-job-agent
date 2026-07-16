import type { z } from "zod";

export interface StructuredRequest<T> { system: string; prompt: string; schema: z.ZodType<T> }
export interface StructuredAiProvider { generate<T>(request: StructuredRequest<T>): Promise<T> }

export function parseStructured<T>(content: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try { json = JSON.parse(content); }
  catch { throw new Error("AI provider returned invalid JSON"); }
  return schema.parse(json);
}
