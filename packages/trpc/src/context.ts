import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "./auth.ts";
import { database } from "./database/index.ts";

export async function getRequestSession(headers: Headers) {
  return await auth.api.getSession({ headers });
}

export async function createContext(opts: FetchCreateContextFnOptions) {
  const session = await getRequestSession(opts.req.headers);
  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    database,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
