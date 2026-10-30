import assert from "node:assert/strict";
import test from "node:test";
import { invalidateEnvForTesting } from "@app/config/env";
import { projectAgentRelease } from "../../../../packages/trpc/src/domain/project-agent-definition.ts";
import { createAIStreamHandler } from "../ai-stream.ts";

test("agent HTTP logs identify the manifest that evaluations consume", async (t) => {
  const previous = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = "json";
  invalidateEnvForTesting();
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = previous;
    invalidateEnvForTesting();
  });
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));
  const manifest = projectAgentRelease();
  const handler = createAIStreamHandler(
    async () => ({ user: { id: "user-a" } }),
    async function* (input) {
      input.onEvent?.({
        event_type: "agent_finished",
        outcome: "complete",
        reason_code: "completed",
        duration_ms: 1,
      });
      yield { type: "complete", text: "SECRET answer" };
    },
    undefined,
    manifest.prompt_version,
    projectAgentRelease,
  );
  await (
    await handler(
      new Request("http://localhost/api/ai/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"prompt":"SECRET prompt"}',
      }),
    )
  ).text();
  const records = lines.map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.release_id === manifest.release_id));
  assert.doesNotMatch(lines.join(), /SECRET/);
});
