import type { Request, Response, NextFunction, RequestHandler } from "express";

const BLOCKED_BOT_UA_PATTERNS: RegExp[] = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /python-requests/i,
  /python-urllib/i,
  /\baiohttp\b/i,
  /\bhttpx\b/i,
  /\bscrapy\b/i,
  /go-http-client/i,
  /^java\//i,
  /libwww-perl/i,
  /apache-httpclient/i,
  /\baxios\//i,
  /\bnode-fetch\b/i,
  /\bundici\b/i,
  /\bokhttp\//i,
  /headlesschrome/i,
  /phantomjs/i,
  /\bsqlmap\b/i,
  /\bnikto\b/i,
  /\bnmap\b/i,
  /\bmasscan\b/i,
  /\bzgrab\b/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /bytespider/i,
  /\bgptbot\b/i,
  /\bccbot\b/i,
  /claudebot/i,
];

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

/**
 * Checks whether a User-Agent string belongs to an empty header or known
 * CLI/scraper/scanner tool. Search engine crawlers (Googlebot, Bingbot) are NOT blocked.
 */
export function isBlockedApiUserAgent(rawUa: string | undefined): boolean {
  if (!rawUa || !rawUa.trim()) return true;
  const ua = rawUa.trim();
  return BLOCKED_BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

/**
 * Applies defensive API default headers (non-cacheable by default; public GET endpoints
 * like /categories explicitly opt into short edge caching).
 */
export const apiDefaultHeadersMiddleware: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
};

/**
 * Blocks empty or known malicious/scraper User-Agents on API routes while
 * exempting /healthz for uptime checks. Does not affect public HTML pages.
 */
export const apiBotUserAgentMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const path = req.path || "";
  if (path === "/healthz" || path === "/api/healthz") {
    next();
    return;
  }

  if (isTestEnv() && req.headers["x-test-enforce-ua"] !== "1") {
    next();
    return;
  }

  const rawUa = Array.isArray(req.headers["user-agent"])
    ? req.headers["user-agent"][0]
    : req.headers["user-agent"];

  if (isBlockedApiUserAgent(rawUa)) {
    res.status(403).json({ error: "تم رفض الطلب غير المصرح به." });
    return;
  }

  next();
};

interface RouteMethodSpec {
  pattern: RegExp;
  methods: string[];
}

const KNOWN_ROUTE_METHODS: RouteMethodSpec[] = [
  { pattern: /^\/healthz$/, methods: ["GET"] },
  { pattern: /^\/db-status$/, methods: ["GET"] },
  { pattern: /^\/security\/form-token$/, methods: ["GET"] },
  { pattern: /^\/staff\/access$/, methods: ["GET"] },
  { pattern: /^\/staff\/claim-owner$/, methods: ["POST"] },
  { pattern: /^\/staff\/login$/, methods: ["POST"] },
  { pattern: /^\/staff\/register$/, methods: ["POST"] },
  { pattern: /^\/staff\/change-password$/, methods: ["POST"] },
  { pattern: /^\/staff\/logout$/, methods: ["POST"] },
  { pattern: /^\/staff\/users$/, methods: ["GET"] },
  { pattern: /^\/staff\/users\/[^/]+$/, methods: ["PATCH", "DELETE"] },
  { pattern: /^\/staff\/users\/[^/]+\/revenue-profile$/, methods: ["GET"] },
  { pattern: /^\/staff\/override-password$/, methods: ["GET", "PUT", "DELETE"] },
  { pattern: /^\/categories$/, methods: ["GET", "POST"] },
  { pattern: /^\/categories\/[^/]+$/, methods: ["PATCH", "DELETE"] },
  { pattern: /^\/customers$/, methods: ["GET"] },
  { pattern: /^\/orders$/, methods: ["GET", "POST"] },
  { pattern: /^\/orders\/track$/, methods: ["GET"] },
  { pattern: /^\/orders\/export$/, methods: ["GET"] },
  { pattern: /^\/orders\/bulk-status$/, methods: ["POST"] },
  { pattern: /^\/orders\/[^/]+$/, methods: ["GET", "PATCH"] },
  { pattern: /^\/dashboard\/summary$/, methods: ["GET"] },
  { pattern: /^\/dashboard\/analytics$/, methods: ["GET"] },
  { pattern: /^\/shifts\/me$/, methods: ["GET"] },
  { pattern: /^\/shifts\/start$/, methods: ["POST"] },
  { pattern: /^\/shifts\/end$/, methods: ["POST"] },
  { pattern: /^\/shifts\/overview$/, methods: ["GET"] },
  { pattern: /^\/shifts\/[^/]+\/force-end$/, methods: ["POST"] },
];

/**
 * Rejects unsupported HTTP methods on known API endpoints with 405 Method Not Allowed
 * and returns clean 404 for unknown endpoints.
 */
export const methodNotAllowedMiddleware: RequestHandler = (
  req: Request,
  res: Response,
) => {
  const normalizedPath = (req.path.startsWith("/api/")
    ? req.path.slice(4)
    : req.path === "/api"
    ? "/"
    : req.path
  ).replace(/\/+$/, "") || "/";

  for (const spec of KNOWN_ROUTE_METHODS) {
    if (spec.pattern.test(normalizedPath)) {
      res.setHeader("Allow", spec.methods.join(", "));
      res.status(405).json({ error: "طريقة الطلب غير مسموحة لهذا المسار." });
      return;
    }
  }

  res.status(404).json({ error: "المسار غير موجود." });
};
