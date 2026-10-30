import assert from "node:assert/strict";
import test from "node:test";
import { agentModel } from "../agent-model.ts";
import { readTool, runAgent } from "../agent.ts";
import { buildContext } from "../context.ts";
import { withFakeProvider } from "./fake-provider.ts";

test("SDK agent adapter sends strict tools, forwards identity and returns tool results on a second call", async () => {
  const bodies: Record<string, unknown>[] = [];
  await withFakeProvider(
    (request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        bodies.push(JSON.parse(body));
        assert.equal(request.headers["x-end-user"], "user-a");
        assert.equal(request.headers["x-request-id"], "request-a");
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: "test",
            object: "chat.completion",
            created: 1,
            model: "fake",
            choices: [
              {
                index: 0,
                finish_reason: bodies.length === 1 ? "tool_calls" : "stop",
                message:
                  bodies.length === 1
                    ? {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "call-a",
                            type: "function",
                            function: { name: "read", arguments: "{}" },
                          },
                        ],
                      }
                    : { role: "assistant", content: "Atlas" },
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
        );
      });
    },
    async () => {
      const result = await runAgent({
        prompt: "Read.",
        instructions: "Read only.",
        tools: [
          readTool({
            name: "read",
            description: "Read.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
            parse: () => undefined,
            execute: async () => '{"name":"Atlas"}',
          }),
        ],
        model: agentModel({ userId: "user-a", requestId: "request-a" }),
        limits: {
          timeoutMs: 1000,
          maxModelCalls: 2,
          maxToolCalls: 1,
          maxTokens: 32_000,
          maxInputTokens: 16_000,
          maxOutputTokens: 100,
        },
      });
      assert.equal(result.text, "Atlas");
      assert.equal(result.usage?.totalTokens, 10);
      assert.equal(bodies[0].max_completion_tokens, 100);
      assert.equal(bodies[0].parallel_tool_calls, false);
      assert.equal(bodies[0].store, false);
      assert.match(JSON.stringify(bodies[1].messages), /Atlas/);
      assert.equal(bodies.length, 2);
    },
  );
});

for (const finish of ["length", "content_filter", "tool_calls", null]) {
  test(`SDK agent adapter rejects incomplete or inconsistent finish: ${finish}`, async () => {
    await withFakeProvider(
      (_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ index: 0, finish_reason: finish, message: { content: "partial" } }],
          }),
        );
      },
      async () => {
        const context = buildContext({
          instructions: "Read only.",
          messages: [{ role: "user", content: "Read." }],
          tools: [],
          maxInputTokens: 16_000,
        });
        await assert.rejects(() =>
          agentModel({ userId: "user-a" })(context, {
            signal: new AbortController().signal,
            maxOutputTokens: 100,
          }),
        );
      },
    );
  });
}
