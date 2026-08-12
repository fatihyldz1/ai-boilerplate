import assert from "node:assert/strict";
import test from "node:test";
import { createAIStreamHandler } from "../server.ts";

test("AI streaming passes the request abort signal to inference", async () => {
  let receivedSignal: AbortSignal | undefined;

  async function* streamText(input: { abortSignal?: AbortSignal }) {
    receivedSignal = input.abortSignal;
    await new Promise<void>((resolve) => {
      input.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  const controller = new AbortController();
  const handler = createAIStreamHandler(async () => ({ user: { id: "test-user" } }), streamText);
  const response = await handler(
    new Request("http://localhost/api/ai/stream", {
      method: "POST",
      body: JSON.stringify({ prompt: "hello" }),
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    }),
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(response.status, 200);
  assert.ok(receivedSignal);
  assert.equal(receivedSignal.aborted, false);

  controller.abort();
  assert.equal(receivedSignal?.aborted, true);
  await response.body?.cancel();
});
