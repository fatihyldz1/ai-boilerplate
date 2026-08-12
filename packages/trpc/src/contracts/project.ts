import { z } from "zod";

export const projectIdInputSchema = z.object({ id: z.string().min(1) });
export const createProjectInputSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const renameProjectInputSchema = projectIdInputSchema.extend({
  name: z.string().trim().min(1).max(120),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>;
