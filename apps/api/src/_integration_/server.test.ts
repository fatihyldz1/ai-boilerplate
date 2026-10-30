import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { database } from "@app/trpc";
import { env } from "@app/config/env";
import { startApi } from "../server.ts";
import { readAIStream } from "@app/inference/contracts";
import { withFakeProvider } from "../../../../packages/inference/src/_test_/fake-provider.ts";

test("real auth cookies protect AI and tRPC routes over HTTP", async () => {
  const server = startApi(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects.list`)).status, 401);
    const anonymous = await fetch(`${base}/api/ai/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: env.BETTER_AUTH_URL },
      body: '{"prompt":""}',
    });
    assert.equal(anonymous.status, 401);
    assert.equal(
      (
        await fetch(`${base}/api/ai/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"prompt":"read"}',
        })
      ).status,
      401,
    );
    const signup = await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: env.BETTER_AUTH_URL },
      body: JSON.stringify({
        name: "Integration user",
        email: `${randomUUID()}@example.com`,
        password: "integration-only-password",
      }),
    });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookies = signup.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    assert.ok(cookies);
    assert.equal(
      (await fetch(`${base}/api/projects.list`, { headers: { Cookie: cookies } })).status,
      200,
    );
    const invalid = await fetch(`${base}/api/ai/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: '{"prompt":""}',
    });
    assert.equal(invalid.status, 400);
    const created = await fetch(`${base}/api/projects.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: '{"name":"Agent project"}',
    });
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    const projectId = createdBody.result.data.id;
    let modelCalls = 0;
    await withFakeProvider(
      (request, response) => {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          modelCalls += 1;
          const input = JSON.parse(body);
          if (modelCalls === 2) assert.match(JSON.stringify(input.messages), /Agent project/);
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  finish_reason: modelCalls === 1 ? "tool_calls" : "stop",
                  message:
                    modelCalls === 1
                      ? {
                          role: "assistant",
                          content: null,
                          tool_calls: [
                            {
                              id: "call-a",
                              type: "function",
                              function: {
                                name: "get_project",
                                arguments: JSON.stringify({ id: projectId }),
                              },
                            },
                          ],
                        }
                      : { role: "assistant", content: "Agent project" },
                },
              ],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            }),
          );
        });
      },
      async () => {
        const response = await fetch(`${base}/api/ai/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({
            prompt: `Read project ${projectId}`,
            userId: "ignored-client-user",
          }),
        });
        assert.equal(response.status, 200);
        const events = await Array.fromAsync(readAIStream(response.body!));
        assert.deepEqual(events.at(-1), { type: "complete", text: "Agent project" });
        assert.equal(events.find((event) => event.type === "usage")?.usage.totalTokens, 10);
        assert.equal(modelCalls, 2);
      },
    );
    const signout = await fetch(`${base}/api/auth/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies, Origin: env.BETTER_AUTH_URL },
      body: "{}",
    });
    assert.equal(signout.status, 200);
    assert.equal(
      (await fetch(`${base}/api/projects.list`, { headers: { Cookie: cookies } })).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${base}/api/ai/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: '{"prompt":"read"}',
        })
      ).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.$client.end();
  }
});
