import { TRPCError, initTRPC } from "@trpc/server";
import type { Context } from "./context.ts";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return error.code === "INTERNAL_SERVER_ERROR"
      ? { ...shape, message: "Internal server error." }
      : shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(function requireUser({ ctx, next }) {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
