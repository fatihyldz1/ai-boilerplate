import { env } from "./env.ts";

export const publicEnv = {
  VITE_API_PORT: String(env.PORT),
};
