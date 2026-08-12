import { relations } from "drizzle-orm";
import { user } from "./schemas/auth.schema.ts";
import { project } from "./schemas/project.schema.ts";

export const projectRelations = relations(project, ({ one }) => ({
  user: one(user, { fields: [project.userId], references: [user.id] }),
}));

export const userProjectRelations = relations(user, ({ many }) => ({
  projects: many(project),
}));
