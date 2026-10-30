import { env } from "@app/config/env";
import {
  InferenceError,
  BudgetError,
  providerConfigId,
  TEXT_PROMPT_VERSION,
  type StreamTextInput,
} from "@app/inference";
import type { AIStreamEvent, TokenUsage } from "@app/inference/contracts";
import type { ReleaseManifest } from "@app/inference/release";
import { createAIAdmission } from "./admission.ts";
import { HttpInputError, readJsonBody } from "./http-input.ts";
import { log, requestContext } from "./logging.ts";

type SessionReader = (headers: Headers) => Promise<{ user: { id: string } } | null | undefined>;
type TextStreamer = (input: StreamTextInput) => AsyncGenerator<AIStreamEvent>;

export function createAIStreamHandler(
  getSession: SessionReader,
  stream: TextStreamer,
  acquire = createAIAdmission(),
  promptVersion = TEXT_PROMPT_VERSION,
  releaseManifest?: () => ReleaseManifest,
) {
  return async function handleAIStream(request: Request) {
    if (request.method !== "POST")
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    const session = await getSession(request.headers);
    if (!session?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    let body: unknown;
    try {
      body = await readJsonBody(request, 128_000);
    } catch (error) {
      if (error instanceof HttpInputError)
        return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const prompt = body && typeof body === "object" && "prompt" in body ? body.prompt : undefined;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20_000) {
      return Response.json(
        { error: "prompt must be a non-empty string of at most 20,000 characters." },
        { status: 400 },
      );
    }
    const context = {
      ...requestContext(request),
      user_id: session.user.id,
      model: env.OPENAI_MODEL,
      app_version: env.APP_VERSION,
      prompt_version: promptVersion,
      provider_config_id: providerConfigId(),
      ...(releaseManifest ? { release_id: releaseManifest().release_id } : {}),
    };
    const admission = acquire(session.user.id);
    if ("retryAfter" in admission) {
      log("ai_denied", { ...context, reason: admission.reason }, "warn");
      return Response.json(
        { error: "AI request limit reached. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(admission.retryAfter) } },
      );
    }
    const release = admission.release;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(env.AI_TIMEOUT_MS);
    const signal = AbortSignal.any([request.signal, controller.signal, timeout]);
    const events = stream({
      prompt,
      abortSignal: signal,
      userId: session.user.id,
      requestId: context.request_id,
      onEvent: ({ event_type, ...event }) =>
        log(event_type, { ...context, ...event }, event.outcome === "error" ? "error" : "info"),
    });
    const encoder = new TextEncoder();
    let cancelled = false;
    let finished = false;
    let usage: TokenUsage | undefined;
    let firstTokenMs: number | null = null;
    function finish(outcome: string, error?: unknown) {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      release();
      log(
        "ai_finished",
        {
          ...context,
          duration_ms: performance.now() - startedAt,
          first_token_ms: firstTokenMs,
          outcome,
          input_tokens: usage?.inputTokens,
          output_tokens: usage?.outputTokens,
          total_tokens: usage?.totalTokens,
          cost_usd: usage?.costUsd,
          usage_known: usage !== undefined,
          error_type: error instanceof Error ? error.name : undefined,
          reason_code: error instanceof BudgetError ? error.reasonCode : undefined,
        },
        ["error", "timeout", "budget_exhausted"].includes(outcome) ? "error" : "info",
      );
    }
    function onAbort() {
      finish(timeout.aborted ? "timeout" : "cancelled");
    }
    signal.addEventListener("abort", onAbort, { once: true });
    const responseStream = new ReadableStream<Uint8Array>(
      {
        async pull(output) {
          try {
            signal.throwIfAborted();
            const step = await events.next();
            if (cancelled) return;
            signal.throwIfAborted();
            if (step.done) throw new InferenceError("AI stream ended before completion.");
            const event = step.value;
            if (event.type === "text-delta" && event.delta.length && firstTokenMs === null) {
              firstTokenMs = performance.now() - startedAt;
            }
            if (event.type === "usage") usage = event.usage;
            if (event.type === "complete" || event.type === "error") {
              await events.return(undefined);
              if (cancelled) return;
              signal.throwIfAborted();
              finish(event.type === "complete" ? "complete" : "error");
            }
            output.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            if (event.type === "complete" || event.type === "error") {
              output.close();
            }
          } catch (error) {
            if (!cancelled) {
              finish(error instanceof BudgetError ? "budget_exhausted" : "error", error);
              const message = timeout.aborted
                ? "AI request timed out."
                : error instanceof InferenceError
                  ? error.message
                  : "AI request failed. Try again shortly.";
              output.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
              output.close();
            }
            await events.return(undefined);
          }
        },
        async cancel() {
          cancelled = true;
          controller.abort();
          finish("cancelled");
          await events.return(undefined);
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(responseStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
