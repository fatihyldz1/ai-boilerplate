import assert from "node:assert/strict";
import test, { after } from "node:test";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { database } from "../database/index.ts";
import { user } from "../database/schemas/auth.schema.ts";
import * as Project from "../domain/project.ts";
import * as ProjectAccess from "../database/access/project.access.ts";
import { appRouter } from "../appRouter.ts";

after(async () => {
  await database.$client.end();
});

function isNotFound(error: unknown) {
  return error instanceof TRPCError && error.code === "NOT_FOUND";
}

test("project CRUD is isolated by authenticated user", async () => {
  const userA = { id: ulid(), name: "User A", email: `${ulid()}@example.com` };
  const userB = { id: ulid(), name: "User B", email: `${ulid()}@example.com` };
  const userIds = [userA.id, userB.id];

  await database.insert(user).values([userA, userB]);

  try {
    const created = await Project.createProject({ userId: userA.id, name: "Starter project" });
    assert.equal((await Project.listProjects(userA.id)).length, 1);
    assert.equal((await Project.listProjects(userB.id)).length, 0);
    await assert.rejects(
      () => Project.getProject({ id: created.id, userId: userB.id }),
      isNotFound,
    );

    await assert.rejects(
      () => Project.renameProject({ id: created.id, userId: userB.id, name: "Stolen" }),
      isNotFound,
    );
    await assert.rejects(
      () => Project.deleteProject({ id: created.id, userId: userB.id }),
      isNotFound,
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
    await assert.rejects(
      () => Project.getProject({ id: created.id, userId: userA.id }),
      isNotFound,
    );
    const [signedIn] = await database
      .select()
      .from(user)
      .where(inArray(user.id, [userA.id]));
    const caller = appRouter.createCaller({ user: signedIn, session: null, database });
    await assert.rejects(() => caller.projects.get({ id: created.id }), isNotFound);
    await assert.rejects(
      () =>
        database.transaction(async (transaction) => {
          await ProjectAccess.createProject({ userId: userA.id, name: "Roll back" }, transaction);
          throw new Error("Rollback probe");
        }),
      /Rollback probe/,
    );
    assert.deepEqual(await Project.listProjects(userA.id), []);
  } finally {
    await database.delete(user).where(inArray(user.id, userIds));
  }
});
