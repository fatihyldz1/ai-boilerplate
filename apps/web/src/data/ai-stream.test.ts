import assert from "node:assert/strict";
import test from "node:test";
import { streamAI } from "./ai-stream.ts";

test("frontend transport passes cancellation and reads an authoritative final answer", async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/ai/stream");
    assert.equal(init?.signal, controller.signal);
    return new Response('{"type":"text-delta","delta":"hi"}\n{"type":"complete","text":"hello"}');
  };
  const events = await Array.fromAsync(streamAI("hi", controller.signal, fetcher));
  assert.deepEqual(events.at(-1), { type: "complete", text: "hello" });
});

test("frontend reader accepts a buffered final answer after task-wide usage", async () => {
  const events = await Array.fromAsync(
    streamAI(
      "read",
      new AbortController().signal,
      async () =>
        new Response(
          '{"type":"usage","usage":{"inputTokens":4,"outputTokens":6,"totalTokens":10}}\n{"type":"text-delta","delta":"Atlas"}\n{"type":"complete","text":"Atlas"}\n',
        ),
    ),
  );
  assert.deepEqual(events.at(-1), { type: "complete", text: "Atlas" });
  assert.equal(events[0].type, "usage");
});

test("frontend transport rejects HTTP failures and truncated responses", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(
    () =>
      Array.fromAsync(
        streamAI("hi", signal, async () =>
          Response.json({ error: "Sign in required." }, { status: 401 }),
        ),
      ),
    /Sign in required/,
  );
  await assert.rejects(
    () =>
      Array.fromAsync(
        streamAI(
          "hi",
          signal,
          async () => new Response('{"type":"text-delta","delta":"partial"}\n'),
        ),
      ),
    /before completion/,
  );
});
