import { fileURLToPath } from "node:url";
import { env } from "@app/config/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const client = new Client({ connectionString: env.DB_URL });
try {
  await client.connect();
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
} finally {
  await client.end();
}
