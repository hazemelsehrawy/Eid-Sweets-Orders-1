import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Auto-detect connection string from Vercel Storage / Supabase integration
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
}

export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const rawUrl = process.env.DATABASE_URL || "";
const isLocalhost = !rawUrl || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");

export const pool = new Pool({
  connectionString:
    rawUrl || "postgresql://postgres:postgres@localhost:5432/eid_sweets",
  connectionTimeoutMillis: 10000,
  max: process.env.VERCEL ? 1 : 10,
  idleTimeoutMillis: 10000,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.warn("Postgres pool error (idle client will be recreated):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
