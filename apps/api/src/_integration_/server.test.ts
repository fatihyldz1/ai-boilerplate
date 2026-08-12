import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../server.ts";

test("AI streaming rejects an invalid prompt", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/ai/stream", {
      method: "POST",
      body: JSON.stringify({ prompt: "" }),
      headers: { "content-type": "application/json" },
    }),
  );

  assert.equal(response.status, 400);
});

test("AI streaming requires authentication", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/ai/stream", {
      method: "POST",
      body: JSON.stringify({ prompt: "hello" }),
      headers: { "content-type": "application/json" },
    }),
  );

  assert.equal(response.status, 401);
});
