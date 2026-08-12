import { projectRouter } from "./routers/project.ts";
import * as Trpc from "./trpc.ts";

export const appRouter = Trpc.router({
  projects: projectRouter,
});

export type AppRouter = typeof appRouter;
