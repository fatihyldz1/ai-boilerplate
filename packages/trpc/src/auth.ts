import { env } from "@app/config/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "./database/index.ts";

export const auth = betterAuth({
  appName: "AI App Starter",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(database, { provider: "pg" }),
});
