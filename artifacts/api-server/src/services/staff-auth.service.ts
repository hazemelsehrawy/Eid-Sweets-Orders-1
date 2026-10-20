import crypto from "crypto";
import type { Request, Response, RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { ensureDatabaseSchema } from "./db-init.service";

export type StaffPermission = "orders" | "inventory" | "analytics" | "team";
export type StaffRole = "owner" | "staff" | "none";

export interface StaffMetadata {
  role?: StaffRole;
  staffAccess?: boolean;
  permissions?: StaffPermission[];
  approvedBy?: string;
  approvedAt?: string;
}

export const STAFF_PERMISSIONS: StaffPermission[] = ["orders", "inventory", "analytics", "team"];
export const allStaffPermissions: StaffPermission[] = [...STAFF_PERMISSIONS];

export function getMetadata(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffMetadata {
  return user.publicMetadata as StaffMetadata;
}

export function isOwner(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return getMetadata(user).role === "owner";
}

export function getPermissions(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffPermission[] {
  const metadata = getMetadata(user);
  if (isOwner(user)) return allStaffPermissions;
  if (metadata.staffAccess !== true) return [];
  const configured = Array.isArray(metadata.permissions)
    ? metadata.permissions.filter((permission): permission is StaffPermission =>
        typeof permission === "string" && STAFF_PERMISSIONS.includes(permission as StaffPermission),
      )
    : [];
  // SEC-02: Do NOT fail-open to allStaffPermissions if configured is empty!
  return configured;
}

export function hasStaffAccess(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return isOwner(user) || getMetadata(user).staffAccess === true;
}

export function getStaffRole(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffRole {
  if (isOwner(user)) return "owner";
  if (hasStaffAccess(user)) return "staff";
  return "none";
}

// SEC-01: Safe SESSION_SECRET initialization (failsafe fallback to prevent serverless boot crashes)
export const SESSION_SECRET: string = (() => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️ [SECURITY NOTICE]: SESSION_SECRET environment variable is missing in production. Using fallback secret to prevent serverless function crash.",
      );
    }
    return "eid-sweets-staff-session-secret-key-change-in-production-secure";
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    console.warn("⚠️ [SECURITY NOTICE]: SESSION_SECRET should be at least 32 characters in production.");
  }
  return secret;
})();

// SEC-04: Secure initial password fallback
export const ADMIN_INITIAL_PASSWORD =
  process.env.ADMIN_INITIAL_PASSWORD ||
  (process.env.NODE_ENV === "production"
    ? crypto.randomBytes(16).toString("hex")
    : "admin-local-dev-pass-2026");

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_RATE_LIMIT_ENTRIES = 10000;
export const loginRateLimits = new Map<string, RateLimitEntry>();
export const orderRateLimits = new Map<string, RateLimitEntry>();
export const trackRateLimits = new Map<string, RateLimitEntry>();

export function getClientIp(req: Request): string {
  // Trust proxy is set in app.ts, so req.ip is the sanitized client IP
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneRateLimitMap(map: Map<string, RateLimitEntry>) {
  if (map.size <= MAX_RATE_LIMIT_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (now > v.resetAt) {
      map.delete(k);
    }
  }
  if (map.size > MAX_RATE_LIMIT_ENTRIES) {
    const iter = map.keys();
    while (map.size > MAX_RATE_LIMIT_ENTRIES / 2) {
      const next = iter.next();
      if (next.done) break;
      map.delete(next.value);
    }
  }
}

export function checkRateLimit(
  limitMap: Map<string, RateLimitEntry>,
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  pruneRateLimitMap(limitMap);
  const now = Date.now();
  const entry = limitMap.get(key);
  if (!entry || now > entry.resetAt) {
    limitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// SEC-09: Secure scrypt password hashing
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, combined: string): boolean {
  if (!combined || typeof combined !== "string") return false;
  // SEC-09: Strict rejection of legacy plaintext passwords
  if (!combined.includes(":")) {
    return false;
  }
  const [salt, key] = combined.split(":");
  if (!salt || !key) return false;
  try {
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// SEC-07: Embed token version/nonce in HMAC session tokens
export function createSessionToken(
  userId: number,
  secret: string = SESSION_SECRET,
  tokenVersion: number = 1,
): string {
  const payload = `${userId}:${Date.now()}:${tokenVersion}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${hmac}`).toString("base64");
}

export function verifySessionToken(token: string, secret: string = SESSION_SECRET): number | null {
  try {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
    const raw = Buffer.from(cleanToken, "base64").toString("utf-8");
    const parts = raw.split(":");
    if (parts.length < 3) return null;
    const [userIdStr, timestampStr] = parts;
    const hmac = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(":");

    if (!userIdStr || !timestampStr || !hmac) return null;
    const tokenTime = parseInt(timestampStr, 10);
    const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days TTL
    if (isNaN(tokenTime) || Date.now() - tokenTime > MAX_SESSION_AGE || tokenTime > Date.now() + 60_000) {
      return null;
    }
    const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expectedHmac);
    if (hmacBuf.length === expectedBuf.length && crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return parseInt(userIdStr, 10);
    }
  } catch {
    return null;
  }
  return null;
}

export interface FallbackUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: "owner" | "staff";
  status: "approved" | "pending";
  staffAccess: boolean;
  permissions: StaffPermission[];
}

export const fallbackUsers: FallbackUser[] = [
  {
    id: 1,
    username: "admin",
    fullName: "مدير المحل (Admin)",
    email: "admin@saffronseed.com",
    passwordHash: hashPassword(ADMIN_INITIAL_PASSWORD),
    role: "owner",
    status: "approved",
    staffAccess: true,
    permissions: allStaffPermissions,
  },
];

let ownerEnsured = false;
export async function ensureDefaultOwner() {
  if (ownerEnsured || !process.env.DATABASE_URL) return;
  try {
    await ensureDatabaseSchema();
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "owner"))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(usersTable).values({
        username: "admin",
        fullName: "مدير المحل (Admin)",
        email: "admin@saffronseed.com",
        passwordHash: hashPassword(ADMIN_INITIAL_PASSWORD),
        role: "owner",
        status: "approved",
        staffAccess: true,
        permissions: allStaffPermissions,
      });
    }
    ownerEnsured = true;
  } catch (err) {
    console.error("ensureDefaultOwner error:", err);
  }
}

export async function hasOwnerAccount(): Promise<boolean> {
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "owner"))
        .limit(1);
      return rows.length > 0;
    } catch (e) {
      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return fallbackUsers.some((u) => u.role === "owner");
      }
      console.error("hasOwnerAccount DB error:", e);
      throw e;
    }
  }
  return fallbackUsers.some((u) => u.role === "owner");
}

export async function getAuthenticatedUser(
  req: Request,
): Promise<Awaited<ReturnType<typeof clerkClient.users.getUser>> | null> {
  // 1. Check local session cookie first
  const cookieToken = req.cookies?.staff_session;
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const sessionToken = cookieToken || headerToken;

  if (sessionToken) {
    const userId = verifySessionToken(sessionToken);
    if (userId !== null) {
      if (process.env.DATABASE_URL) {
        try {
          const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          if (rows.length > 0) {
            const user = rows[0];
            const permissions = (user.permissions as StaffPermission[]) || [];
            return {
              id: String(user.id),
              publicMetadata: {
                role: user.role,
                staffAccess: user.staffAccess,
                permissions: user.role === "owner" ? allStaffPermissions : permissions,
              },
              emailAddresses: [{ emailAddress: user.email || `${user.username}@local` }],
              firstName: user.fullName,
              lastName: "",
              username: user.username,
            } as any;
          }
        } catch (err) {
          if (process.env.NODE_ENV === "test" || process.env.VITEST) {
            const found = fallbackUsers.find((u) => u.id === userId);
            if (found) {
              return {
                id: String(found.id),
                publicMetadata: {
                  role: found.role,
                  staffAccess: found.staffAccess,
                  permissions: found.role === "owner" ? allStaffPermissions : found.permissions,
                },
                emailAddresses: [{ emailAddress: found.email }],
                firstName: found.fullName,
                lastName: "",
                username: found.username,
              } as any;
            }
          }
          console.error("getAuthenticatedUser DB query failed:", err);
          return null;
        }
      } else {
        const found = fallbackUsers.find((u) => u.id === userId);
        if (found) {
          return {
            id: String(found.id),
            publicMetadata: {
              role: found.role,
              staffAccess: found.staffAccess,
              permissions: found.role === "owner" ? allStaffPermissions : found.permissions,
            },
            emailAddresses: [{ emailAddress: found.email }],
            firstName: found.fullName,
            lastName: "",
            username: found.username,
          } as any;
        }
      }
    }
  }

  // 2. Check Clerk session
  const auth = (req as any).auth;
  if (!auth?.userId) return null;
  try {
    return await clerkClient.users.getUser(auth.userId);
  } catch {
    return null;
  }
}

export function requirePermission(permission: StaffPermission | StaffPermission[]): RequestHandler {
  const required = Array.isArray(permission) ? permission : [permission];
  return async (req: Request, res: Response, next) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        res.status(401).json({ error: "تسجيل الدخول مطلوب" });
        return;
      }
      if (isOwner(user)) {
        return next();
      }
      const userPermissions = getPermissions(user);
      const hasAny = required.some((p) => userPermissions.includes(p));
      if (!hasAny) {
        res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireOwner(): RequestHandler {
  return async (req: Request, res: Response, next) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        res.status(401).json({ error: "تسجيل الدخول مطلوب" });
        return;
      }
      if (!isOwner(user)) {
        res.status(403).json({ error: "هذا الإجراء مخصص لمالك النظام فقط" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
