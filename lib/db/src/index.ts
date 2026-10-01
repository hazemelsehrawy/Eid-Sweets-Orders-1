import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/eid_sweets",
  connectionTimeoutMillis: 2500,
});

pool.on("error", (err) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("Postgres pool error:", err.message);
  }
});

export const db = drizzle(pool, { schema });

export * from "./schema";
