import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { categoriesTable, ordersTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/db-status", async (_req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  const dbUrl = process.env.DATABASE_URL || "";
  const isConfigured = Boolean(dbUrl);
  let isConnected = false;
  let errorMsg: string | null = null;
  let categoriesCount = 0;
  let ordersCount = 0;
  let maskedHost = "";

  if (isConfigured) {
    try {
      const parsed = new URL(dbUrl.replace(/^postgresql:/, "http:"));
      maskedHost = parsed.host;
    } catch {}

    try {
      const catRows = await db.select({ count: sql<number>`count(*)` }).from(categoriesTable);
      categoriesCount = Number(catRows[0]?.count ?? 0);
      const ordRows = await db.select({ count: sql<number>`count(*)` }).from(ordersTable);
      ordersCount = Number(ordRows[0]?.count ?? 0);
      isConnected = true;
    } catch (err) {
      errorMsg = (err as Error).message;
    }
  }

  if (isProd) {
    res.json({
      databaseConfigured: isConfigured,
      databaseConnected: isConnected,
      status: isConnected ? "ok" : "error",
    });
    return;
  }

  res.json({
    databaseConfigured: isConfigured,
    databaseConnected: isConnected,
    databaseHost: maskedHost || (isConfigured ? "configured" : "NOT SET (Check Vercel Environment Variables)"),
    categoriesCount,
    ordersCount,
    isVercel: Boolean(process.env.VERCEL),
    error: errorMsg,
    hint: !isConfigured
      ? "DATABASE_URL is missing in Vercel. Go to Vercel Dashboard -> Project Settings -> Environment Variables and add DATABASE_URL."
      : !isConnected
      ? "DATABASE_URL is set but failed to connect to Supabase: " + errorMsg
      : "Supabase is fully connected and functioning on Vercel!",
  });
});

export default router;
