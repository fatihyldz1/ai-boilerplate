import assert from "node:assert/strict";
import test from "node:test";
import { invalidateEnvForTesting } from "@app/config/env";
import { withRequestLogging } from "../logging.ts";

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
