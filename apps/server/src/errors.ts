import type { ApiError } from "@campus-job-agent/contracts";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class ApiFailure extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiError["error"]["code"],
    message: string,
    public readonly retryAt?: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiFailure) {
      return reply.code(error.statusCode).send({ error: {
        code: error.code,
        message: error.message,
        ...(error.retryAt ? { retryAt: error.retryAt } : {}),
      } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "validation_failed", message: "输入内容无效" },
      });
    }
    return reply.code(500).send({
      error: { code: "internal_error", message: "请求处理失败" },
    });
  });
}
