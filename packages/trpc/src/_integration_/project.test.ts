import assert from "node:assert/strict";
import test from "node:test";
import { inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { database } from "../database/index.ts";
import { user } from "../database/schemas/auth.schema.ts";
import * as Project from "../domain/project.ts";

test("project CRUD is isolated by authenticated user", async () => {
  const userA = { id: ulid(), name: "User A", email: `${ulid()}@example.com` };
  const userB = { id: ulid(), name: "User B", email: `${ulid()}@example.com` };
  const userIds = [userA.id, userB.id];

  await database.insert(user).values([userA, userB]);

  try {
    const created = await Project.createProject({ userId: userA.id, name: "Starter project" });
    assert.equal((await Project.listProjects(userA.id)).length, 1);
    assert.equal((await Project.listProjects(userB.id)).length, 0);
    assert.equal(await Project.getProject({ id: created.id, userId: userB.id }), null);

    await assert.rejects(
      () => Project.renameProject({ id: created.id, userId: userB.id, name: "Stolen" }),
      /Project not found/,
    );
    await assert.rejects(
      () => Project.deleteProject({ id: created.id, userId: userB.id }),
      /Project not found/,
    );

    const renamed = await Project.renameProject({
      id: created.id,
      userId: userA.id,
      name: "Renamed project",
    });
    assert.equal(renamed.name, "Renamed project");
    assert.equal(
      (await Project.deleteProject({ id: created.id, userId: userA.id })).id,
      created.id,
    );
    assert.equal(await Project.getProject({ id: created.id, userId: userA.id }), null);
  } finally {
    await database.delete(user).where(inArray(user.id, userIds));
  }
});
