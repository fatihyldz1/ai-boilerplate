import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { AgentModel } from "@app/inference/agent";
import { runEvaluation } from "@app/inference/evaluation";
import { contentDigest } from "@app/inference/digest";
import { withFakeProvider } from "../../../inference/src/_test_/fake-provider.ts";
import {
  evaluateProjectAgent,
  projectAgentScenarios,
  projectAgentDatasetDigest,
  PROJECT_AGENT_SCORER_VERSION,
} from "../../evals/project-agent.ts";

const versions = {
  app: "test",
  prompt: "test",
  model: "fake",
  provider: "fake",
  scorer: PROJECT_AGENT_SCORER_VERSION,
};

const model: AgentModel = async (context) => {
  const last = context.messages.at(-1)!;
  if (last.role === "tool") {
    const data = JSON.parse(last.content);
    return { text: JSON.stringify({ name: data.project.name, source: data.source }), calls: [] };
  }
  const prompt = context.messages[1].content!;
  if (prompt.includes("not supplied")) return { text: '{"status":"needs_project_id"}', calls: [] };
  if (prompt.startsWith("Delete")) return { text: '{"status":"read_only"}', calls: [] };
  const id = prompt.match(/project-(?:a|b|missing)\b/)![0];
  return {
    text: null,
    calls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "get_project", arguments: JSON.stringify({ id }) },
      },
    ],
  };
};

test("agent scenarios check tools, sources, isolation and ordered termination through the real runtime", async () => {
  const report = await runEvaluation(
    projectAgentScenarios,
    (input) => evaluateProjectAgent(input, model),
    versions,
  );
  assert.equal(report.total, 6);
  assert.equal(report.passed, 6);
  assert.match(projectAgentDatasetDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(report),
    /Foreign secret|COMPROMISED|eval-user|"project-a"|"project-b"|Read project/,
  );
  assert.deepEqual(
    report.cases[0].events?.map((event) => event.event_type),
    ["agent_step_finished", "agent_step_finished", "agent_step_finished", "agent_finished"],
  );
});

test("correct-looking answers cannot hide absent, repeated or wrongly targeted tool calls", async () => {
  const scenario = projectAgentScenarios[0];
  const output = await evaluateProjectAgent(scenario.input, model);
  assert.equal(await scenario.score(output), true);
  assert.equal(
    await scenario.score({ ...output, text: '{"name":"Atlas","source":"wrong"}' }),
    false,
  );
  assert.equal(await scenario.score({ ...output, lookups: [] }), false);
  assert.equal(
    await scenario.score({ ...output, lookups: [...output.lookups, ...output.lookups] }),
    false,
  );
  assert.equal(
    await scenario.score({ ...output, lookups: [{ id: "project-b", userId: "eval-user" }] }),
    false,
  );
  assert.equal(await scenario.score({ ...output, events: output.events.slice(0, -1) }), false);
  const failed = await runEvaluation(
    [scenario],
    (input) =>
      evaluateProjectAgent(input, async () => ({
        text: '{"name":"Atlas","source":"project:project-a"}',
        calls: [],
      })),
    versions,
  );
  assert.equal(failed.cases[0].status, "failed");
});

test("looping and unavailable tools remain execution errors in the evaluation denominator", async () => {
  const report = await runEvaluation(
    projectAgentScenarios.slice(0, 1),
    (input) =>
      evaluateProjectAgent(input, async () => ({
        text: null,
        calls: [
          {
            id: "call",
            type: "function",
            function: { name: "get_project", arguments: '{"id":"project-a"}' },
          },
        ],
      })),
    versions,
  );
  assert.equal(report.total, 1);
  assert.equal(report.cases[0].status, "error");
  assert.equal(report.cases[0].events?.at(-1)?.reason_code, "tool_calls_exhausted");
});

test("agent eval CLI has explicit paid opt-in, bounded repeats and release evidence", async () => {
  const run = promisify(execFile);
  const script = fileURLToPath(new URL("../../../../scripts/eval-agent.ts", import.meta.url));
  let requests = 0;
  await withFakeProvider(
    (request, response) => {
      requests += 1;
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", async () => {
        const input = JSON.parse(raw);
        const result = await model(
          { messages: input.messages, tools: input.tools, estimatedInputTokens: 1 },
          { signal: new AbortController().signal, maxOutputTokens: 100 },
        );
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: "fake",
            object: "chat.completion",
            created: 1,
            model: "fake",
            choices: [
              {
                index: 0,
                finish_reason: result.calls.length ? "tool_calls" : "stop",
                message: {
                  role: "assistant",
                  content: result.text,
                  ...(result.calls.length ? { tool_calls: result.calls } : {}),
                },
              },
            ],
          }),
        );
      });
    },
    async () => {
      for (const args of [
        [],
        ["--repeat", "2"],
        ["--live", "--repeat", "0"],
        ["--live", "--repeat", "21"],
        ["--live", "--release"],
      ]) {
        await assert.rejects(() =>
          run(process.execPath, [script, ...args], {
            env: {
              ...process.env,
              APP_VERSION: "development",
              APP_SOURCE_REVISION: "",
              APP_ARTIFACT_DIGEST: "",
            },
          }),
        );
      }
      assert.equal(requests, 0);
      const identity = {
        ...process.env,
        APP_VERSION: "release-test",
        APP_SOURCE_REVISION: "a".repeat(40),
        APP_ARTIFACT_DIGEST: "sha256:" + "b".repeat(64),
      };
      const manifest = JSON.parse(
        (await run(process.execPath, [script, "--manifest"], { env: identity })).stdout,
      );
      assert.equal(requests, 0);
      const { stdout } = await run(
        process.execPath,
        [script, "--live", "--repeat", "2", "--release"],
        { env: identity },
      );
      const evidence = JSON.parse(stdout);
      assert.equal(evidence.release.release_id, manifest.release_id);
      assert.equal(evidence.dataset.digest, projectAgentDatasetDigest);
      assert.equal(evidence.dataset.repeats, 2);
      assert.equal(evidence.report.total, 12);
      assert.equal(evidence.report.passed, 12);
      assert.equal(requests, 16);
      const { evidence_id, ...bound } = evidence;
      assert.equal(evidence_id, contentDigest(bound));
      assert.doesNotMatch(stdout, /Foreign secret|COMPROMISED|eval-user|Read project/);
    },
  );
});
