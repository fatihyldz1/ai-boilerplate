import assert from "node:assert/strict";
import test from "node:test";
import { readAIStream } from "../contracts.ts";

function bytes(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
function source(text: string) {
  return bytes([new TextEncoder().encode(text)]);
}

test("NDJSON handles split UTF-8, blank lines, and a final record without newline", async () => {
  const encoded = new TextEncoder().encode(
    '\n{"type":"text-delta","delta":"café"}\n{"type":"complete","text":"café"}',
  );
  const split = encoded.indexOf(0xc3) + 1;
  const events = await Array.fromAsync(
    readAIStream(bytes([encoded.slice(0, split), encoded.slice(split)])),
  );
  assert.deepEqual(events, [
    { type: "text-delta", delta: "café" },
    { type: "complete", text: "café" },
  ]);
});

for (const text of [
  '{"type":"text-delta","delta":"partial"}\n',
  "{broken}\n",
  '{"type":"unknown"}\n',
  '{"type":"usage","usage":{"inputTokens":-1,"outputTokens":0,"totalTokens":0}}\n',
]) {
  test(`invalid or unterminated stream rejects: ${text.slice(0, 45)}`, async () => {
    await assert.rejects(() => Array.fromAsync(readAIStream(source(text))));
  });
}

test("early exit from the reader cancels its underlying stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"type":"text-delta","delta":"hi"}\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const _event of readAIStream(stream)) break;
  assert.equal(cancelled, true);
});

test("a safe error is an explicit terminal event", async () => {
  assert.deepEqual(
    await Array.fromAsync(readAIStream(source('{"type":"error","message":"Try again."}\n'))),
    [{ type: "error", message: "Try again." }],
  );
});
