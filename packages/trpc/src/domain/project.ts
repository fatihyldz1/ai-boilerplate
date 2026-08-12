import * as ProjectAccess from "../database/access/project.access.ts";

export async function createProject(input: { userId: string; name: string }) {
  return await ProjectAccess.createProject(input);
}

export async function getProject(input: { id: string; userId: string }) {
  return await ProjectAccess.getProject(input);
}

export async function listProjects(userId: string) {
  return await ProjectAccess.listProjects(userId);
}

export async function renameProject(input: { id: string; userId: string; name: string }) {
  const updated = await ProjectAccess.renameProject(input);
  if (!updated) throw new Error("Project not found.");
  return updated;
}

export async function deleteProject(input: { id: string; userId: string }) {
  const deleted = await ProjectAccess.deleteProject(input);
  if (!deleted) throw new Error("Project not found.");
  return deleted;
}
