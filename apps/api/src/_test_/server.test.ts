import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { invalidateEnvForTesting } from "@app/config/env";
import { InferenceError, streamText } from "@app/inference";
import type { AIStreamEvent } from "@app/inference/contracts";
import { createAIStreamHandler } from "../ai-stream.ts";
import { startHttpServer } from "../http-server.ts";
import { withRequestLogging } from "../logging.ts";
import {
  sendChunks,
  textChunk,
  withFakeProvider,
} from "../../../../packages/inference/src/_test_/fake-provider.ts";

const getSession = async () => ({ user: { id: "test-user" } });
async function* success(): AsyncGenerator<AIStreamEvent> {
  yield { type: "complete", text: "ok" };
}
function request(body = JSON.stringify({ prompt: "hello" }), headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ai/stream", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
async function address(server: Server) {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("authentication runs before reading any body bytes", async () => {
  let pulled = false;
  const handler = createAIStreamHandler(async () => null, success);
  const body = new ReadableStream(
    {
      pull() {
        pulled = true;
        throw new Error("Must not read");
      },
    },
    { highWaterMark: 0 },
  );
  const response = await handler(
    new Request("http://localhost/api/ai/stream", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
  );
  assert.equal(response.status, 401);
  assert.equal(pulled, false);
});

test("method, malformed JSON, empty prompts, and prompt bounds are checked", async () => {
  const handler = createAIStreamHandler(getSession, success);
  assert.equal((await handler(new Request("http://localhost/api/ai/stream"))).status, 405);
  for (const body of [
    "{broken}",
    "null",
    "{}",
    JSON.stringify({ prompt: " " }),
    JSON.stringify({ prompt: "x".repeat(20_001) }),
  ]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal((await handler(request(undefined, { "Content-Type": "text/plain" }))).status, 415);
});

test("raw body size is bounded even with a short prompt or misleading content-length", async () => {
  const handler = createAIStreamHandler(getSession, success);
  const body = JSON.stringify({ prompt: "hi", extra: "x".repeat(128_000) });
  assert.equal((await handler(request(body, { "Content-Length": "1" }))).status, 413);
  assert.equal((await handler(request("{}", { "Content-Length": "128001" }))).status, 413);
});

test("chunked bodies are stopped at the byte limit and their reader is cancelled", async () => {
  let cancelled = false;
  const body = new ReadableStream(
    {
      pull(controller) {
        controller.enqueue(new Uint8Array(64_001));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const handler = createAIStreamHandler(getSession, success);
  const response = await handler(
    new Request("http://localhost/api/ai/stream", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
  );
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
});

test("pull-based streaming does not start the provider until consumed", async () => {
  let started = false;
  const handler = createAIStreamHandler(getSession, async function* () {
    started = true;
    yield { type: "complete", text: "ok" };
  });
  const response = await handler(request());
  assert.equal(started, false);
  assert.match(await response.text(), /"type":"complete"/);
  assert.equal(started, true);
});

test("unexpected EOF is an error and upstream messages are kept private", async () => {
  for (const error of [
    undefined,
    new Error("SECRET provider credentials"),
    new InferenceError("Safe explanation."),
  ]) {
    const handler = createAIStreamHandler(getSession, async function* () {
      yield { type: "text-delta", delta: "partial" };
      if (error) throw error;
    });
    const response = await handler(request());
    const text = await response.text();
    assert.match(text, /"type":"error"/);
    assert.doesNotMatch(text, /SECRET|"type":"complete"/);
    if (error instanceof InferenceError) assert.match(text, /Safe explanation/);
  }
});

test("request timeout releases admission and returns an explicit failure", async (t) => {
  const original = process.env.AI_TIMEOUT_MS;
  process.env.AI_TIMEOUT_MS = "20";
  invalidateEnvForTesting();
  t.after(() => {
    if (original === undefined) delete process.env.AI_TIMEOUT_MS;
    else process.env.AI_TIMEOUT_MS = original;
    invalidateEnvForTesting();
  });
  let released = 0;
  const handler = createAIStreamHandler(
    getSession,
    async function* (input) {
      await new Promise<void>((resolve) =>
        input.abortSignal?.addEventListener("abort", () => resolve(), { once: true }),
      );
      input.abortSignal?.throwIfAborted();
      yield { type: "complete", text: "unexpected success" };
    },
    () => ({
      release() {
        released += 1;
      },
    }),
  );
  const response = await handler(request());
  const [text] = await Promise.all([response.text(), delay(40)]);
  assert.match(text, /timed out/);
  assert.equal(released, 1);
});

test("generator cleanup failure cannot turn a success into a broken HTTP stream", async () => {
  const handler = createAIStreamHandler(getSession, async function* () {
    try {
      yield { type: "complete", text: "ok" };
    } finally {
      await Promise.reject(new Error("SECRET cleanup details"));
    }
  });
  const text = await (await handler(request())).text();
  assert.match(text, /"type":"error"/);
  assert.doesNotMatch(text, /SECRET|"type":"complete"/);
});

test("admission denial returns a retry hint without calling inference", async () => {
  const handler = createAIStreamHandler(getSession, success, () => ({
    retryAfter: 12,
    reason: "rate",
  }));
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "12");
});

test("real HTTP response disconnect aborts inference after the POST body is complete", async () => {
  const aborted = Promise.withResolvers<void>();
  let signal: AbortSignal | undefined;
  const handler = createAIStreamHandler(getSession, async function* (input) {
    signal = input.abortSignal;
    yield { type: "text-delta", delta: "hello" };
    await new Promise<void>((resolve) =>
      input.abortSignal?.addEventListener(
        "abort",
        () => {
          aborted.resolve();
          resolve();
        },
        { once: true },
      ),
    );
  });
  const server = startHttpServer(withRequestLogging(handler), 0);
  try {
    const base = await address(server);
    const response = await fetch(`${base}/api/ai/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    const reader = response.body!.getReader();
    await reader.read();
    assert.equal(signal?.aborted, false);
    await reader.cancel();
    await Promise.race([
      aborted.promise,
      delay(2000).then(() => {
        throw new Error("Disconnect did not abort inference.");
      }),
    ]);
    assert.equal(signal?.aborted, true);
  } finally {
    await close(server);
  }
});

test("real HTTP rejects an ongoing chunked upload with 413", async () => {
  const server = startHttpServer(createAIStreamHandler(getSession, success), 0);
  try {
    const base = await address(server);
    const response = await fetch(`${base}/api/ai/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(2000),
      duplex: "half",
      body: new ReadableStream({
        start(controller) {
          for (let index = 0; index < 3; index += 1) controller.enqueue(new Uint8Array(64_001));
        },
      }),
    } as RequestInit & { duplex: "half" });
    assert.equal(response.status, 413);
    assert.match(await response.text(), /too large/);
  } finally {
    await close(server);
  }
});

test("HTTP transport preserves repeated cookies and survives handler failures", async () => {
  const server = startHttpServer(
    withRequestLogging((req) => {
      if (new URL(req.url).pathname === "/fail") throw new Error("SECRET database URL");
      return new Response("ok", {
        headers: [
          ["Set-Cookie", "first=1; Path=/"],
          ["Set-Cookie", "second=2; Path=/"],
        ],
      });
    }),
    0,
  );
  try {
    const base = await address(server);
    assert.equal((await fetch(`${base}/fail`)).status, 500);
    const response = await fetch(base);
    assert.deepEqual(response.headers.getSetCookie(), ["first=1; Path=/", "second=2; Path=/"]);
    assert.equal(await response.text(), "ok");
  } finally {
    await close(server);
  }
});

test("real HTTP slow readers apply backpressure and cancellation closes the source", async () => {
  let pulls = 0;
  const cancelled = Promise.withResolvers<void>();
  const server = startHttpServer(
    () =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              pulls += 1;
              controller.enqueue(new Uint8Array(256_000));
            },
            cancel() {
              cancelled.resolve();
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    0,
  );
  try {
    const base = await address(server);
    const controller = new AbortController();
    const response = await fetch(base, { signal: controller.signal });
    assert.ok(response.body);
    await delay(40);
    assert.ok(pulls < 200, `Producer ran ahead by ${pulls} chunks.`);
    controller.abort();
    await Promise.race([
      cancelled.promise,
      delay(2000).then(() => {
        throw new Error("Source was not cancelled.");
      }),
    ]);
  } finally {
    await close(server);
  }
});

test("the real SDK and HTTP route stream a fake provider reply and reject truncation end to end", async () => {
  for (const finish of ["stop", null]) {
    await withFakeProvider(
      (_request, response) => sendChunks(response, [textChunk("hello", finish)]),
      async () => {
        const server = startHttpServer(createAIStreamHandler(getSession, streamText), 0);
        try {
          const base = await address(server);
          const response = await fetch(`${base}/api/ai/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"prompt":"hello"}',
          });
          const records = (await response.text())
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          assert.equal(records.at(-1).type, finish === "stop" ? "complete" : "error");
        } finally {
          await close(server);
        }
      },
    );
  }
});

test("browser disconnect closes the actual provider connection and releases its reservation once", async () => {
  const providerClosed = Promise.withResolvers<void>();
  let released = 0;
  await withFakeProvider(
    (_request, response) => {
      response.once("close", () => providerClosed.resolve());
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify(textChunk("hello"))}\n\n`);
    },
    async () => {
      const handler = createAIStreamHandler(getSession, streamText, () => ({
        release() {
          released += 1;
        },
      }));
      const server = startHttpServer(handler, 0);
      try {
        const base = await address(server);
        const response = await fetch(`${base}/api/ai/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"prompt":"hello"}',
        });
        const reader = response.body!.getReader();
        await reader.read();
        await reader.cancel();
        await Promise.race([
          providerClosed.promise,
          delay(2000).then(() => {
            throw new Error("Provider connection survived browser disconnect.");
          }),
        ]);
        assert.equal(released, 1);
      } finally {
        await close(server);
      }
    },
  );
});
