import assert from "node:assert/strict";
import test from "node:test";
import { createProjectInputSchema } from "../contracts/project.ts";

test("project names are trimmed and bounded", () => {
  assert.equal(createProjectInputSchema.parse({ name: "  Demo  " }).name, "Demo");
  assert.throws(() => createProjectInputSchema.parse({ name: "" }));
});
