import {
  createProjectInputSchema,
  projectIdInputSchema,
  renameProjectInputSchema,
} from "../contracts/project.ts";
import * as Project from "../domain/project.ts";
import * as Trpc from "../trpc.ts";

export const projectRouter = Trpc.router({
  list: Trpc.protectedProcedure.query(({ ctx }) => Project.listProjects(ctx.user.id)),
  get: Trpc.protectedProcedure
    .input(projectIdInputSchema)
    .query(({ ctx, input }) => Project.getProject({ id: input.id, userId: ctx.user.id })),
  create: Trpc.protectedProcedure
    .input(createProjectInputSchema)
    .mutation(({ ctx, input }) => Project.createProject({ userId: ctx.user.id, name: input.name })),
  rename: Trpc.protectedProcedure
    .input(renameProjectInputSchema)
    .mutation(({ ctx, input }) =>
      Project.renameProject({ id: input.id, userId: ctx.user.id, name: input.name }),
    ),
  delete: Trpc.protectedProcedure
    .input(projectIdInputSchema)
    .mutation(({ ctx, input }) => Project.deleteProject({ id: input.id, userId: ctx.user.id })),
});
