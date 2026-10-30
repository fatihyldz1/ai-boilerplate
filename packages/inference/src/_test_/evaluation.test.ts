import assert from "node:assert/strict";
import test from "node:test";
import { runEvaluation, type EvaluationScenario } from "../evaluation.ts";
import { textScenarios } from "../../evals/scenarios.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { sendChunks, textChunk, withFakeProvider } from "./fake-provider.ts";

const versions = {
  app: "test-release",
  prompt: "text-v1",
  model: "fake-model",
  provider: "fake-provider",
  scorer: "test-v1",
};

test("evaluation distinguishes wrong answers, execution errors and scorer errors without dropping cases", async () => {
  const scenarios: EvaluationScenario<string>[] = [
    { id: "pass", version: "1", input: "correct", score: ({ text }) => text === "correct" },
    {
      id: "wrong-answer",
      version: "1",
      input: "incorrect",
      score: ({ text }) => text === "correct",
    },
    { id: "provider-error", version: "1", input: "throw", score: () => true },
    {
      id: "scorer-error",
      version: "1",
      input: "correct",
      score: () => {
        throw new Error("SECRET scorer details");
      },
    },
  ];
  const report = await runEvaluation(
    scenarios,
    async (input) => {
      if (input === "throw") throw new Error("SECRET credentials");
      return { text: input, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
    },
    versions,
  );
  assert.equal(report.total, 4);
  assert.equal(report.passed, 1);
  assert.deepEqual(
    report.cases.map((item) => item.status),
    ["passed", "failed", "error", "error"],
  );
  assert.deepEqual(report.versions, versions);
  assert.equal(report.cases[2].stage, "execution");
  assert.equal(report.cases[3].stage, "scoring");
  assert.doesNotMatch(JSON.stringify(report), /SECRET|credentials|incorrect/);
});

test("reference scorers reject normally finished but incorrect or malformed answers", async () => {
  assert.equal(await textScenarios[0].score({ text: "READY" }), true);
  assert.equal(await textScenarios[0].score({ text: "READY and done" }), false);
  for (const text of ["not JSON", "null", '{"name":"Wrong"}', '{"name":"Atlas","extra":true}']) {
    assert.equal(await textScenarios[1].score({ text }), false);
  }
  assert.equal(await textScenarios[1].score({ text: '{"name":"Atlas"}' }), true);
});

test("live eval CLI requires opt-in and runs both scenarios against a fake provider", async () => {
  let requests = 0;
  await withFakeProvider(
    (request, response) => {
      requests += 1;
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        const prompt = JSON.parse(raw).messages[0].content;
        sendChunks(response, [
          textChunk(prompt.includes("READY") ? "READY" : '{"name":"Atlas"}', "stop"),
        ]);
      });
    },
    async () => {
      const run = promisify(execFile);
      const script = fileURLToPath(new URL("../../../../scripts/eval-ai.ts", import.meta.url));
      await assert.rejects(
        () => run(process.execPath, [script]),
        (error: unknown) => {
          assert.ok(error instanceof Error && "stderr" in error);
          assert.match(String(error.stderr), /two paid model requests/);
          return true;
        },
      );
      assert.equal(requests, 0);
      const { stdout } = await run(process.execPath, [script, "--live"], {
        env: { ...process.env, APP_VERSION: "eval-test" },
      });
      const report = JSON.parse(stdout);
      assert.equal(report.total, 2);
      assert.equal(report.passed, 2);
      assert.equal(report.versions.app, "eval-test");
      assert.equal(requests, 2);
      assert.doesNotMatch(stdout, /Reply with|Create a project/);
    },
  );
});
