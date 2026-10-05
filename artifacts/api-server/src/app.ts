import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

// Auto-detect connection string from Vercel Storage / Supabase integration
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().replace(/\/+$/, ""))
  : null;

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins && allowedOrigins.length > 0) {
        if (allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }
      }
      // If allowedOrigins is not explicitly configured, allow all origins
      if (!allowedOrigins || allowedOrigins.length === 0) {
        return callback(null, true);
      }
      // Automatically allow Vercel domains (*.vercel.app) and local environments
      try {
        const url = new URL(normalizedOrigin);
        if (
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname.endsWith(".vercel.app") ||
          process.env.NODE_ENV !== "production"
        ) {
          return callback(null, true);
        }
      } catch {
        // invalid URL
      }
      return callback(null, false);
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.CLERK_SECRET_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.warn("CLERK_SECRET_KEY not set. Clerk authentication disabled for development.");
}

// Mount router under /api AND at root / to handle both direct and stripped Vercel serverless rewrites
app.use("/api", router);
app.use(router);

// Centralized error-handling middleware
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error(
      { err, url: req.url, method: req.method },
      "Unhandled server error",
    );
    if (res.headersSent) {
      return _next(err);
    }
    const hasStatusCode =
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      typeof (err as { statusCode: unknown }).statusCode === "number";
    const statusCode = hasStatusCode
      ? (err as { statusCode: number }).statusCode
      : 500;

    const isDev = process.env.NODE_ENV !== "production";
    const message =
      statusCode < 500
        ? (err as Error).message || "Bad Request"
        : isDev && err instanceof Error
        ? err.message
        : "Internal Server Error";

    res.status(statusCode).json({ error: message });
  },
);

export default app;
