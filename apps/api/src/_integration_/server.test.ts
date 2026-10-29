import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { database } from "@app/trpc";
import { env } from "@app/config/env";
import { startApi } from "../server.ts";

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
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.$client.end();
  }
});
