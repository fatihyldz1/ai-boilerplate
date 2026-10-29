import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema.ts";

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("project_user_created_at_idx").on(table.userId, table.createdAt)],
);
