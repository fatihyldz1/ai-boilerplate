import { env } from "@app/config/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

const pool = new Pool({ connectionString: env.DB_URL });

export const database = drizzle({ client: pool, schema });
export type DatabaseTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
export type DatabaseExecutor = typeof database | DatabaseTransaction;
