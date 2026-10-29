import { randomUUID } from "node:crypto";
import { env } from "@app/config/env";

type LogFields = {
  request_id?: string;
  method?: string;
  path?: string;
  status?: number;
  response_ms?: number;
  duration_ms?: number;
  outcome?: string;
  user_id?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  usage_known?: boolean;
  reason?: string;
  error_type?: string;
};

const contexts = new WeakMap<Request, { request_id: string; method: string; path: string }>();

export function requestContext(request: Request) {
  let context = contexts.get(request);
  if (!context) {
    const suppliedId = request.headers.get("x-request-id") ?? "";
    context = {
      request_id: /^[a-zA-Z0-9_-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID(),
      method: request.method,
      path: new URL(request.url).pathname,
    };
    contexts.set(request, context);
  }
  return context;
}

export function log(
  event: string,
  fields: LogFields = {},
  level: "info" | "warn" | "error" = "info",
) {
  const record = { time: new Date().toISOString(), level, event, ...fields };
  console.log(
    env.LOG_FORMAT === "json"
      ? JSON.stringify(record)
      : `${record.time} ${level} ${event} ${JSON.stringify(fields)}`,
  );
}

export function withRequestLogging(handler: (request: Request) => Promise<Response> | Response) {
  return async function loggedHandler(request: Request) {
    const startedAt = performance.now();
    const context = requestContext(request);
    try {
      const response = await handler(request);
      const headers = new Headers(response.headers);
      headers.set("X-Request-ID", context.request_id);
      log(
        "http_response",
        { ...context, status: response.status, response_ms: performance.now() - startedAt },
        response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      log(
        "http_error",
        {
          ...context,
          status: 500,
          duration_ms: performance.now() - startedAt,
          error_type: error instanceof Error ? error.name : "UnknownError",
        },
        "error",
      );
      return Response.json(
        { error: "Internal server error." },
        { status: 500, headers: { "X-Request-ID": context.request_id } },
      );
    }
  };
}
