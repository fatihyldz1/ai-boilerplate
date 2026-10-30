import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = "http://localhost:3000";
assert.equal((await fetch(`${base}/api/projects.list`)).status, 401);
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    name: "Container check",
    email: `${randomUUID()}@example.com`,
    password: "container-test-only-password",
  }),
});
assert.equal(signup.status, 200, await signup.clone().text());
const cookie = signup.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
assert.ok(cookie);
const headers = { "Content-Type": "application/json", Cookie: cookie, Origin: base };
const created = await fetch(`${base}/api/projects.create`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "Container project" }),
});
assert.equal(created.status, 200, await created.clone().text());
const list = await fetch(`${base}/api/projects.list`, { headers });
assert.equal(list.status, 200);
assert.match(await list.text(), /Container project/);
const invalidAI = await fetch(`${base}/api/ai/stream`, {
  method: "POST",
  headers,
  body: '{"prompt":""}',
});
assert.equal(invalidAI.status, 400);
const invalidAgent = await fetch(`${base}/api/ai/projects`, {
  method: "POST",
  headers,
  body: '{"prompt":""}',
});
assert.equal(invalidAgent.status, 400);
console.log(
  "Production image passed migrations, auth cookies, protected CRUD and AI input checks.",
);
