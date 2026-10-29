import assert from "node:assert/strict";
import test from "node:test";
import { env, invalidateEnvForTesting } from "@app/config/env";
import { streamText } from "../index.ts";
import type { AIStreamEvent } from "../contracts.ts";
import { sendChunks, textChunk, withFakeProvider } from "./fake-provider.ts";

test("inference package exposes the starter stream contract", async () => {
  const module = await import("../index.ts");
  assert.equal(typeof module.streamText, "function");
});

test("chat completions send identity, a token bound, and stream text plus usage", async () => {
  let body: Record<string, unknown> = {};
  let endUser: string | undefined;
  let path: string | undefined;
  await withFakeProvider(
    (request, response) => {
      path = request.url;
      endUser = request.headers["x-end-user"] as string;
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        body = JSON.parse(raw);
        sendChunks(response, [
          textChunk("hello", "stop"),
          {
            choices: [],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost_usd: 0.001 },
          },
        ]);
      });
    },
    async () => {
      const events = await Array.fromAsync(
        streamText({ prompt: "hi", userId: "user-a", requestId: "request-a" }),
      );
      assert.deepEqual(events, [
        { type: "text-delta", delta: "hello" },
        {
          type: "usage",
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, costUsd: 0.001 },
        },
        { type: "complete", text: "hello" },
      ]);
      assert.equal(path, "/v1/chat/completions");
      assert.equal(endUser, "user-a");
      assert.equal(body.max_completion_tokens, env.AI_MAX_OUTPUT_TOKENS);
      assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
    },
  );
});

for (const reason of [null, "length", "content_filter", "tool_calls"]) {
  test(`finish reason ${reason} never reports success`, async () => {
    await withFakeProvider(
      (_request, response) => sendChunks(response, [textChunk("partial", reason)]),
      async () => {
        const events: AIStreamEvent[] = [];
        await assert.rejects(async () => {
          for await (const event of streamText({ prompt: "hi" })) events.push(event);
        });
        assert.equal(
          events.some((event) => event.type === "complete"),
          false,
        );
      },
    );
  });
}

test("a configured gateway uses max_tokens without a second provider implementation", async () => {
  let body: Record<string, unknown> = {};
  await withFakeProvider(
    (request, response) => {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        body = JSON.parse(raw);
        sendChunks(response, [textChunk("ok", "stop")]);
      });
    },
    async () => {
      process.env.OPENAI_TOKEN_LIMIT_FIELD = "max_tokens";
      invalidateEnvForTesting();
      await Array.fromAsync(streamText({ prompt: "hi" }));
      assert.equal(body.max_tokens, env.AI_MAX_OUTPUT_TOKENS);
      assert.equal(body.max_completion_tokens, undefined);
    },
  );
});

test("provider failures are not automatically retried", async () => {
  let calls = 0;
  await withFakeProvider(
    (_request, response) => {
      calls += 1;
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "provider unavailable" } }));
    },
    async () => {
      await assert.rejects(() => Array.fromAsync(streamText({ prompt: "hi" })));
      assert.equal(calls, 1);
    },
  );
});

test("invalid provider usage fails at the boundary", async () => {
  await withFakeProvider(
    (_request, response) =>
      sendChunks(response, [
        textChunk("hello", "stop"),
        { choices: [], usage: { prompt_tokens: -1, completion_tokens: 3, total_tokens: 2 } },
      ]),
    async () => {
      await assert.rejects(() => Array.fromAsync(streamText({ prompt: "hi" })), /invalid usage/);
    },
  );
});

test("an aborted provider stream never emits complete", async () => {
  await withFakeProvider(
    (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify(textChunk("partial"))}\n\n`);
    },
    async () => {
      const controller = new AbortController();
      const iterator = streamText({ prompt: "hi", abortSignal: controller.signal });
      assert.equal((await iterator.next()).value?.type, "text-delta");
      controller.abort();
      await assert.rejects(() => iterator.next());
    },
  );
});
