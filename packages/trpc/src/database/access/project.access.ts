import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { type DatabaseExecutor, database } from "../index.ts";
import { project } from "../schemas/project.schema.ts";

export async function createProject(
  input: { userId: string; name: string },
  executor: DatabaseExecutor = database,
) {
  const [created] = await executor
    .insert(project)
    .values({ id: ulid(), userId: input.userId, name: input.name })
    .returning();
  return created;
}

export async function getProject(
  input: { id: string; userId: string },
  executor: DatabaseExecutor = database,
) {
  const [found] = await executor
    .select()
    .from(project)
    .where(and(eq(project.id, input.id), eq(project.userId, input.userId)))
    .limit(1);
  return found ?? null;
}

export async function listProjects(userId: string, executor: DatabaseExecutor = database) {
  return await executor
    .select()
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(asc(project.createdAt));
}

export async function renameProject(
  input: { id: string; userId: string; name: string },
  executor: DatabaseExecutor = database,
) {
  const [updated] = await executor
    .update(project)
    .set({ name: input.name, updatedAt: new Date() })
    .where(and(eq(project.id, input.id), eq(project.userId, input.userId)))
    .returning();
  return updated ?? null;
}

export async function deleteProject(
  input: { id: string; userId: string },
  executor: DatabaseExecutor = database,
) {
  const [deleted] = await executor
    .delete(project)
    .where(and(eq(project.id, input.id), eq(project.userId, input.userId)))
    .returning();
  return deleted ?? null;
}
