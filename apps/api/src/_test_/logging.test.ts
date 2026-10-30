import assert from "node:assert/strict";
import test from "node:test";
import { invalidateEnvForTesting } from "@app/config/env";
import { withRequestLogging } from "../logging.ts";
import { createAIStreamHandler } from "../ai-stream.ts";
import type { AIStreamEvent } from "@app/inference/contracts";
import { BudgetError } from "@app/inference";

test("JSON logging correlates requests and never records bodies, credentials, queries or raw failures", async (t) => {
  const previous = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = "json";
  invalidateEnvForTesting();
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = previous;
    invalidateEnvForTesting();
  });
  const logs: string[] = [];
  t.mock.method(console, "log", (value: string) => {
    logs.push(value);
  });
  const handler = withRequestLogging(() => {
    throw new Error("SECRET provider key");
  });
  const response = await handler(
    new Request("http://localhost/fail?token=SECRET", {
      method: "POST",
      headers: { "X-Request-ID": "test-request", Authorization: "Bearer SECRET" },
      body: "SECRET prompt",
    }),
  );
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("X-Request-ID"), "test-request");
  const record = JSON.parse(logs[0]);
  assert.equal(record.event, "http_error");
  assert.equal(record.request_id, "test-request");
  assert.equal(record.level, "error");
  assert.doesNotMatch(logs.join(), /SECRET/);
  assert.doesNotMatch(await response.text(), /SECRET/);
});

test("AI telemetry records versions, first visible text and steps without content", async (t) => {
  const previous = process.env.LOG_FORMAT;
  const previousVersion = process.env.APP_VERSION;
  process.env.LOG_FORMAT = "json";
  process.env.APP_VERSION = "release-test";
  invalidateEnvForTesting();
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = previous;
    if (previousVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = previousVersion;
    invalidateEnvForTesting();
  });
  const logs: string[] = [];
  t.mock.method(console, "log", (value: string) => logs.push(value));
  for (const mode of ["text", "empty", "error", "budget"]) {
    const handler = createAIStreamHandler(
      async () => ({ user: { id: "user-a" } }),
      async function* (input): AsyncGenerator<AIStreamEvent> {
        input.onStep?.({
          step_id: 1,
          step_type: "model",
          duration_ms: 1,
          outcome: mode === "error" ? "error" : "complete",
        });
        yield { type: "text-delta", delta: "" };
        if (mode === "budget") throw new BudgetError("AI task model budget exhausted.");
        if (mode === "error") throw new Error("SECRET provider details");
        if (mode === "text") yield { type: "text-delta", delta: "SECRET answer" };
        yield { type: "complete", text: "SECRET answer" };
      },
      undefined,
      "test-prompt-v1",
    );
    await (
      await handler(
        new Request("http://localhost/api/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Request-ID": mode },
          body: '{"prompt":"SECRET prompt"}',
        }),
      )
    ).text();
  }
  const records = logs.map((line) => JSON.parse(line));
  const finished = records.filter((item) => item.event === "ai_finished");
  assert.equal(finished.length, 4);
  assert.ok(finished[0].first_token_ms >= 0);
  assert.equal(finished[1].first_token_ms, null);
  assert.equal(finished[2].first_token_ms, null);
  assert.equal(finished[3].outcome, "budget_exhausted");
  assert.ok(
    records.every(
      (item) =>
        item.app_version === "release-test" &&
        item.prompt_version === "test-prompt-v1" &&
        /^[a-f0-9]{16}$/.test(item.provider_config_id),
    ),
  );
  assert.doesNotMatch(logs.join(), /SECRET/);
});
