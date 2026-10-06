import crypto from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  orderItemsTable,
  ordersTable,
  usersTable,
} from "@workspace/db";
import {
  CreateCategoryBody,
  CreateOrderBody,
  ListOrdersQueryParams,
  TrackOrderQueryParams,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
  GetOrderParams,
  UpdateOrderBody,
  UpdateOrderParams,
  ExportOrdersQueryParams,
  UpdateStaffUserBody,
  UpdateStaffUserParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

class InsufficientStockError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

const STAFF_PERMISSIONS = ["orders", "inventory", "analytics", "team"] as const;
type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
type StaffRole = "owner" | "staff" | "none";
type StaffMetadata = {
  role?: unknown;
  staffAccess?: unknown;
  permissions?: unknown;
};

const allStaffPermissions = [...STAFF_PERMISSIONS];

function getMetadata(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffMetadata {
  return user.publicMetadata as StaffMetadata;
}

function isOwner(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return getMetadata(user).role === "owner";
}

function getPermissions(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffPermission[] {
  const metadata = getMetadata(user);
  if (isOwner(user)) return allStaffPermissions;
  if (metadata.staffAccess !== true) return [];
  const configured = Array.isArray(metadata.permissions)
    ? metadata.permissions.filter((permission): permission is StaffPermission =>
        typeof permission === "string" && STAFF_PERMISSIONS.includes(permission as StaffPermission),
      )
    : [];
  // Preserve access for accounts created before granular permissions existed.
  return configured.length > 0 ? configured : allStaffPermissions;
}

function hasStaffAccess(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return isOwner(user) || getMetadata(user).staffAccess === true;
}

function getStaffRole(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): StaffRole {
  if (isOwner(user)) return "owner";
  if (hasStaffAccess(user)) return "staff";
  return "none";
}

export const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "production"
    ? crypto.randomBytes(32).toString("hex")
    : "saffron-seed-super-secret-key-2026-cairo-production-stable");

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginRateLimits = new Map<string, RateLimitEntry>();
const orderRateLimits = new Map<string, RateLimitEntry>();

function getClientIp(req: Parameters<RequestHandler>[0]): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(
  limitMap: Map<string, RateLimitEntry>,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
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

// Periodic cleanup of expired rate limit entries to prevent memory leak
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of loginRateLimits.entries()) {
      if (now > v.resetAt) loginRateLimits.delete(k);
    }
    for (const [k, v] of orderRateLimits.entries()) {
      if (now > v.resetAt) orderRateLimits.delete(k);
    }
  }, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, combined: string): boolean {
  if (!combined) return false;
  if (!combined.includes(":")) {
    return password === combined;
  }
  const [salt, key] = combined.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export function createSessionToken(userId: number, secret: string = SESSION_SECRET): string {
  const payload = `${userId}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${hmac}`).toString("base64");
}

export function verifySessionToken(token: string, secret: string = SESSION_SECRET): number | null {
  try {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
    const raw = Buffer.from(cleanToken, "base64").toString("utf-8");
    const [userIdStr, timestampStr, hmac] = raw.split(":");
    if (!userIdStr || !timestampStr || !hmac) return null;
    const tokenTime = parseInt(timestampStr, 10);
    const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days TTL
    if (isNaN(tokenTime) || Date.now() - tokenTime > MAX_SESSION_AGE || tokenTime > Date.now() + 60_000) {
      return null;
    }
    const payload = `${userIdStr}:${timestampStr}`;
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
  status: "pending" | "approved" | "rejected";
  staffAccess: boolean;
  permissions: StaffPermission[];
  createdAt: Date;
  updatedAt: Date;
}

export const fallbackUsers: FallbackUser[] = [
  {
    id: 1,
    username: "admin",
    fullName: "مدير المحل (Admin)",
    email: "admin@saffronseed.com",
    passwordHash: hashPassword("admin"),
    role: "owner",
    status: "approved",
    staffAccess: true,
    permissions: [...allStaffPermissions],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let ownerEnsured = false;
let schemaEnsured = false;

async function ensureDatabaseSchema() {
  if (schemaEnsured || !process.env.DATABASE_URL) return;
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE category_unit AS ENUM ('kilo', 'box', 'piece');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE order_status AS ENUM ('pending', 'accepted', 'rejected', 'preparing', 'ready', 'delivered');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE order_created_by AS ENUM ('guest', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('owner', 'staff');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS categories (
        id serial PRIMARY KEY,
        name varchar(160) NOT NULL,
        unit varchar(32) NOT NULL DEFAULT 'kilo',
        price_per_unit numeric(10, 2) NOT NULL,
        stock_quantity numeric(10, 2) NOT NULL DEFAULT '0',
        low_stock_threshold numeric(10, 2) NOT NULL DEFAULT '5',
        image_url text,
        is_active boolean NOT NULL DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS orders (
        id serial PRIMARY KEY,
        order_number varchar(32) NOT NULL UNIQUE,
        customer_name varchar(160) NOT NULL,
        phone_number varchar(32) NOT NULL,
        pickup_date date NOT NULL,
        pickup_time varchar(32) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'pending',
        notes text,
        total_price numeric(12, 2) NOT NULL DEFAULT '0',
        deposit_amount numeric(12, 2) NOT NULL DEFAULT '0',
        remaining_balance numeric(12, 2) NOT NULL DEFAULT '0',
        payment_method varchar(32) NOT NULL DEFAULT 'cash',
        payment_status varchar(32) NOT NULL DEFAULT 'unpaid',
        created_by varchar(32) NOT NULL DEFAULT 'guest',
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id serial PRIMARY KEY,
        order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        category_id integer NOT NULL REFERENCES categories(id),
        quantity numeric(10, 2) NOT NULL,
        subtotal numeric(12, 2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        username varchar(64) NOT NULL UNIQUE,
        full_name varchar(160) NOT NULL,
        email varchar(160),
        password_hash text NOT NULL,
        role varchar(32) NOT NULL DEFAULT 'staff',
        status varchar(32) NOT NULL DEFAULT 'pending',
        staff_access boolean NOT NULL DEFAULT false,
        permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );

      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'categories' AND column_name = 'lowstockthreshold'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'categories' AND column_name = 'low_stock_threshold'
        ) THEN
          ALTER TABLE categories RENAME COLUMN lowstockthreshold TO low_stock_threshold;
        END IF;
      END $$;

      ALTER TABLE categories
        ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(10, 2) NOT NULL DEFAULT '5',
        ADD COLUMN IF NOT EXISTS image_url text,
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

      ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS deposit_amount numeric(12, 2) NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS remaining_balance numeric(12, 2) NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS payment_method varchar(32) NOT NULL DEFAULT 'cash',
        ADD COLUMN IF NOT EXISTS payment_status varchar(32) NOT NULL DEFAULT 'unpaid',
        ADD COLUMN IF NOT EXISTS created_by varchar(32) NOT NULL DEFAULT 'guest';

      CREATE INDEX IF NOT EXISTS orders_pickup_date_idx ON orders (pickup_date);
      CREATE INDEX IF NOT EXISTS orders_phone_number_idx ON orders (phone_number);
      CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
      CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

      CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
      CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
    `);
    schemaEnsured = true;
  } catch (e) {
    console.error("Database schema init error:", e);
  }
}

async function ensureDefaultOwner() {
  if (ownerEnsured || !process.env.DATABASE_URL) return;
  await ensureDatabaseSchema();
  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(usersTable).values({
        username: "admin",
        fullName: "مدير المحل (Admin)",
        email: "admin@saffronseed.com",
        passwordHash: hashPassword("admin"),
        role: "owner",
        status: "approved",
        staffAccess: true,
        permissions: ["orders", "inventory", "analytics", "team"],
      });
    }
    ownerEnsured = true;
  } catch {
    // continue
  }
}

function getEmail(user: { emailAddresses?: { id: string; emailAddress: string }[]; primaryEmailAddressId?: string; email?: string | null }) {
  if (user.email) return user.email;
  if (!user.emailAddresses || user.emailAddresses.length === 0) return "";
  return user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? "";
}

function toStaffMember(user: any) {
  const meta = user.publicMetadata || {};
  return {
    userId: String(user.id),
    name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || getEmail(user),
    email: getEmail(user),
    username: user.username || user.rawUser?.username || "",
    role: (meta.role || (isOwner(user) ? "owner" : "staff")) as StaffRole,
    status: (meta.status || (meta.staffAccess ? "approved" : "pending")) as "pending" | "approved" | "rejected",
    staffAccess: hasStaffAccess(user),
    permissions: getPermissions(user),
  };
}

const MAX_USER_CACHE_SIZE = 500;
const userCache = new Map<string, { user: Awaited<ReturnType<typeof clerkClient.users.getUser>>; expiresAt: number }>();
let cachedHasOwner: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function invalidateUserCache(userId?: string) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
  cachedHasOwner = null;
}

async function listClerkUsers() {
  const allUsers: Awaited<ReturnType<typeof clerkClient.users.getUser>>[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const result = await clerkClient.users.getUserList({ limit, offset });
    allUsers.push(...result.data);
    if (result.data.length < limit || allUsers.length >= (result.totalCount ?? 500)) {
      break;
    }
    offset += limit;
  }
  return allUsers;
}

async function hasOwnerAccount() {
  if (!process.env.DATABASE_URL) return true;
  try {
    await ensureDefaultOwner();
    const dbOwners = await db.select().from(usersTable).where(eq(usersTable.role, "owner")).limit(1);
    if (dbOwners.length > 0) return true;
  } catch {
    return true;
  }

  if (!process.env.CLERK_SECRET_KEY) return true;
  if (cachedHasOwner && Date.now() < cachedHasOwner.expiresAt) {
    return cachedHasOwner.value;
  }
  try {
    const users = await listClerkUsers();
    const exists = users.some(isOwner);
    cachedHasOwner = { value: exists, expiresAt: Date.now() + CACHE_TTL_MS };
    return exists;
  } catch {
    return false;
  }
}

async function getAuthenticatedUser(req: Parameters<RequestHandler>[0]) {
  try {
    await ensureDefaultOwner();
  } catch {}

  // 1. Check custom staff_session cookie or header
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  const sessionToken = cookies?.["staff_session"] || (req.headers["x-staff-session"] as string | undefined);
  if (sessionToken) {
    const userId = verifySessionToken(sessionToken);
    if (userId) {
      if (userId === 1) {
        return {
          id: "1",
          username: "admin",
          fullName: "مدير المحل (Admin)",
          firstName: "مدير",
          lastName: "المحل",
          emailAddresses: [{ id: "email-1", emailAddress: "admin@saffronseed.com" }],
          primaryEmailAddressId: "email-1",
          publicMetadata: {
            role: "owner",
            staffAccess: true,
            status: "approved",
            permissions: allStaffPermissions,
          },
          rawUser: {
            id: 1,
            username: "admin",
            fullName: "مدير المحل (Admin)",
            role: "owner",
            status: "approved",
            staffAccess: true,
            permissions: allStaffPermissions,
          },
        } as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>> & { rawUser: any; username: string };
      }
      if (process.env.DATABASE_URL) {
        try {
          const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          if (rows.length > 0) {
            const u = rows[0];
            return {
              id: String(u.id),
              username: u.username,
              fullName: u.fullName,
              firstName: u.fullName.split(" ")[0] || u.fullName,
              lastName: u.fullName.split(" ").slice(1).join(" ") || "",
              emailAddresses: [{ id: `email-${u.id}`, emailAddress: u.email || `${u.username}@local` }],
              primaryEmailAddressId: `email-${u.id}`,
              publicMetadata: {
                role: u.role,
                staffAccess: u.staffAccess,
                status: u.status,
                permissions: (u.permissions || []) as StaffPermission[],
              },
              rawUser: u,
            } as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>> & { rawUser: typeof u; username: string };
          }
        } catch {}
      }
      const memUser = fallbackUsers.find((u) => u.id === userId);
      if (memUser) {
        return {
          id: String(memUser.id),
          username: memUser.username,
          fullName: memUser.fullName,
          firstName: memUser.fullName.split(" ")[0] || memUser.fullName,
          lastName: memUser.fullName.split(" ").slice(1).join(" ") || "",
          emailAddresses: [{ id: `email-${memUser.id}`, emailAddress: memUser.email || `${memUser.username}@local` }],
          primaryEmailAddressId: `email-${memUser.id}`,
          publicMetadata: {
            role: memUser.role,
            staffAccess: memUser.staffAccess,
            status: memUser.status,
            permissions: memUser.permissions,
          },
          rawUser: memUser,
        } as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>> & { rawUser: any; username: string };
      }
    }
  }

  // 2. Fallback to Clerk if CLERK_SECRET_KEY is present
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const auth = getAuth(req);
      const userId = auth?.userId;
      if (!userId) return null;

      const cached = userCache.get(userId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.user;
      }

      const user = await clerkClient.users.getUser(userId);
      if (user) {
        if (userCache.size >= MAX_USER_CACHE_SIZE) {
          const oldestKey = userCache.keys().next().value;
          if (oldestKey) userCache.delete(oldestKey);
        }
        userCache.set(userId, { user, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return user;
    } catch {
      return null;
    }
  }

  return null;
}

const requirePermission = (permission: StaffPermission): RequestHandler => async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Admin sign-in required" });
      return;
    }
    if (!hasStaffAccess(user)) {
      res.status(403).json({ error: "Staff access required" });
      return;
    }
    if (!getPermissions(user).includes(permission)) {
      res.status(403).json({ error: "Permission required", permission });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

const requireOwner: RequestHandler = async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Admin sign-in required" });
      return;
    }
    if (!isOwner(user)) {
      res.status(403).json({ error: "Owner access required" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.get("/staff/access", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Admin sign-in required" });
      return;
    }
    const permissions = getPermissions(user);
    res.json({
      staffAccess: hasStaffAccess(user),
      role: getStaffRole(user),
      permissions,
      canManageTeam: isOwner(user),
      setupAvailable: !(await hasOwnerAccount()),
      userId: user.id,
      name: user.fullName || (user as any).username || "",
      username: (user as any).username || (user as any).rawUser?.username || "admin",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/staff/claim-owner", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Admin sign-in required" });
      return;
    }
    await ensureDefaultOwner();
    if (process.env.DATABASE_URL) {
      try {
        const rows = await db.select().from(usersTable).where(eq(usersTable.username, "admin")).limit(1);
        if (rows.length > 0) {
          res.json({
            staffAccess: true,
            role: "owner",
            permissions: allStaffPermissions,
            canManageTeam: true,
            setupAvailable: false,
            userId: String(rows[0].id),
          });
          return;
        }
      } catch {
        // fallback
      }
    }
    res.json({
      staffAccess: true,
      role: "owner",
      permissions: allStaffPermissions,
      canManageTeam: true,
      setupAvailable: false,
      userId: "1",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/staff/login", async (req, res) => {
  try {
    const ip = getClientIp(req);
    // Limit to 15 attempts per 5 minutes per IP
    if (!checkRateLimit(loginRateLimits, ip, 15, 5 * 60 * 1000)) {
      res.status(429).json({ error: "محاولات تسجيل دخول كثيرة جداً. يرجى الانتظار بضع دقائق." });
      return;
    }

    await ensureDefaultOwner();
    const { username, password, role } = req.body || {};

    if (!password) {
      res.status(400).json({ error: "كلمة المرور مطلوبة" });
      return;
    }

    const selectedRole = role === "staff" ? "staff" : "owner";
    const targetUsername = username ? String(username).trim() : (selectedRole === "owner" ? "admin" : "");

    if (selectedRole === "owner") {
      let ownerUser: any = null;
      if (process.env.DATABASE_URL) {
        try {
          if (targetUsername) {
            const byUsername = await db
              .select()
              .from(usersTable)
              .where(and(eq(usersTable.role, "owner"), eq(usersTable.username, targetUsername)))
              .limit(1);
            if (byUsername.length > 0) ownerUser = byUsername[0];
          }

          if (!ownerUser) {
            const anyOwner = await db.select().from(usersTable).where(eq(usersTable.role, "owner")).limit(1);
            if (anyOwner.length > 0) ownerUser = anyOwner[0];
          }
        } catch {
          // fallback
        }
      }

      if (!ownerUser) {
        ownerUser = fallbackUsers.find((u) => u.role === "owner" && (u.username === targetUsername || !targetUsername)) || null;
      }

      if (!ownerUser) {
        if (password === "admin" && (targetUsername === "admin" || !targetUsername)) {
          const token = createSessionToken(1);
          res.cookie("staff_session", token, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          res.cookie("dev_admin", "true", {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });

          res.json({
            success: true,
            token,
            role: "owner",
            user: {
              userId: "1",
              name: "مدير المحل (Admin)",
              email: "admin@saffronseed.com",
              username: "admin",
              role: "owner",
              status: "approved",
              staffAccess: true,
              permissions: allStaffPermissions,
            },
          });
          return;
        }
        res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        return;
      }

      if (!verifyPassword(password, ownerUser.passwordHash)) {
        res.status(401).json({ error: "كلمة مرور المالك غير صحيحة" });
        return;
      }

      const token = createSessionToken(ownerUser.id);
      res.cookie("staff_session", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie("dev_admin", "true", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        token,
        role: "owner",
        user: toStaffMember({
          id: String(ownerUser.id),
          fullName: ownerUser.fullName,
          username: ownerUser.username,
          email: ownerUser.email,
          publicMetadata: {
            role: "owner",
            staffAccess: true,
            permissions: allStaffPermissions,
            status: "approved",
          },
        }),
      });
      return;
    }

    // Regular Staff Login
    if (!targetUsername) {
      res.status(400).json({ error: "اسم المستخدم مطلوب لدخول الموظف" });
      return;
    }

    let staff: any = null;
    if (process.env.DATABASE_URL) {
      try {
        const staffRows = await db
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.role, "staff"), eq(usersTable.username, targetUsername)))
          .limit(1);
        if (staffRows.length > 0) staff = staffRows[0];
      } catch {}
    }

    if (!staff) {
      staff = fallbackUsers.find((u) => u.role === "staff" && u.username === targetUsername) || null;
    }

    if (!staff) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }

    if (!verifyPassword(password, staff.passwordHash)) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }

    if (staff.status === "pending" || !staff.staffAccess) {
      res.status(403).json({
        error: "حسابك قيد المراجعة في انتظار موافقة مالك المحل",
        pendingApproval: true,
      });
      return;
    }

    if (staff.status === "rejected") {
      res.status(403).json({
        error: "تم رفض أو إيقاف هذا الحساب من قِبل مالك المحل",
        rejected: true,
      });
      return;
    }

    const token = createSessionToken(staff.id);
    res.cookie("staff_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      role: "staff",
      user: toStaffMember({
        id: String(staff.id),
        fullName: staff.fullName,
        username: staff.username,
        email: staff.email,
        publicMetadata: {
          role: "staff",
          staffAccess: staff.staffAccess,
          permissions: staff.permissions,
          status: staff.status,
        },
      }),
    });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

router.post("/staff/register", async (req, res) => {
  try {
    await ensureDefaultOwner();
    const { username, fullName, password, email } = req.body || {};
    if (!username || !fullName || !password) {
      res.status(400).json({ error: "يرجى ملء جميع الحقول المطلوبة (الاسم، اسم المستخدم، كلمة المرور)" });
      return;
    }
    const cleanUsername = String(username).trim();
    const cleanFullName = String(fullName).trim();

    if (cleanUsername.length < 3) {
      res.status(400).json({ error: "يجب ألا يقل اسم المستخدم عن 3 أحرف" });
      return;
    }
    if (String(password).length < 4) {
      res.status(400).json({ error: "يجب ألا تقل كلمة المرور عن 4 أحرف" });
      return;
    }

    // Check existing in DB
    let isDuplicate = false;
    if (process.env.DATABASE_URL) {
      try {
        const existing = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.username, cleanUsername))
          .limit(1);
        if (existing.length > 0) isDuplicate = true;
      } catch {}
    }
    if (!isDuplicate) {
      if (fallbackUsers.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        isDuplicate = true;
      }
    }

    if (isDuplicate) {
      res.status(409).json({ error: "اسم المستخدم هذا مسجل بالفعل. يرجى اختيار اسم آخر." });
      return;
    }

    let createdUser: any = null;
    const passwordHash = hashPassword(String(password));
    const userEmail = email ? String(email).trim() : `${cleanUsername}@counter.local`;

    if (process.env.DATABASE_URL) {
      try {
        const [newUser] = await db
          .insert(usersTable)
          .values({
            username: cleanUsername,
            fullName: cleanFullName,
            email: userEmail,
            passwordHash,
            role: "staff",
            status: "pending",
            staffAccess: false,
            permissions: ["orders"],
          })
          .returning();
        if (newUser) createdUser = newUser;
      } catch (dbErr) {
        console.warn("DB staff register failed, using in-memory fallback:", (dbErr as Error).message);
      }
    }

    if (!createdUser) {
      const nextId = fallbackUsers.length ? Math.max(...fallbackUsers.map((u) => u.id)) + 1 : 2;
      const memUser: FallbackUser = {
        id: nextId,
        username: cleanUsername,
        fullName: cleanFullName,
        email: userEmail,
        passwordHash,
        role: "staff",
        status: "pending",
        staffAccess: false,
        permissions: ["orders"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      fallbackUsers.push(memUser);
      createdUser = memUser;
    }

    res.status(201).json({
      success: true,
      message: "تم إرسال طلب الانضمام بنجاح! في انتظار موافقة مالك المحل لتفعيل حسابك.",
      pendingApproval: true,
      user: {
        userId: String(createdUser.id),
        username: createdUser.username,
        name: createdUser.fullName,
        status: createdUser.status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "تعذر تسجيل الحساب الجديد" });
  }
});

router.post("/staff/change-password", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
      return;
    }

    const { currentPassword, newPassword, targetUserId } = req.body || {};
    if (!newPassword || String(newPassword).length < 4) {
      res.status(400).json({ error: "يجب ألا تقل كلمة المرور الجديدة عن 4 أحرف" });
      return;
    }

    const rawUser = (user as any).rawUser;
    const isUserOwner = isOwner(user);

    if (targetUserId && String(targetUserId) !== String(user.id)) {
      if (!isUserOwner) {
        res.status(403).json({ error: "مالك المحل فقط يمكنه تغيير كلمات مرور الموظفين" });
        return;
      }
      const targetIdNum = parseInt(String(targetUserId), 10);
      const newHash = hashPassword(String(newPassword));
      if (process.env.DATABASE_URL) {
        try {
          await db
            .update(usersTable)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(usersTable.id, targetIdNum));
        } catch {}
      }
      const memTarget = fallbackUsers.find((u) => u.id === targetIdNum);
      if (memTarget) {
        memTarget.passwordHash = newHash;
        memTarget.updatedAt = new Date();
      }

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
      return;
    }

    if (rawUser) {
      if (currentPassword && !verifyPassword(String(currentPassword), rawUser.passwordHash)) {
        res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
        return;
      }

      const newHash = hashPassword(String(newPassword));
      if (process.env.DATABASE_URL) {
        try {
          await db
            .update(usersTable)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(usersTable.id, rawUser.id));
        } catch {}
      }
      const memUser = fallbackUsers.find((u) => u.id === rawUser.id);
      if (memUser) {
        memUser.passwordHash = newHash;
        memUser.updatedAt = new Date();
      }

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
      return;
    }

    res.status(400).json({ error: "تعذر تحديث كلمة المرور لهذا الحساب" });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تغيير كلمة المرور" });
  }
});

router.post("/staff/logout", (_req, res) => {
  res.clearCookie("staff_session", { path: "/" });
  res.clearCookie("dev_admin", { path: "/" });
  res.json({ success: true });
});

router.get("/staff/users", requireOwner, async (_req, res, next) => {
  try {
    await ensureDefaultOwner();
    let members: any[] = [];
    if (process.env.DATABASE_URL) {
      try {
        const dbUsers = await db.select().from(usersTable).orderBy(asc(usersTable.id));
        members = dbUsers.map((u) => ({
          userId: String(u.id),
          name: u.fullName,
          email: u.email || `${u.username}@local`,
          username: u.username,
          role: u.role,
          status: u.status,
          staffAccess: u.staffAccess,
          permissions: (u.permissions || []) as StaffPermission[],
        }));
      } catch (dbErr) {
        console.warn("DB list users failed, falling back to memory:", (dbErr as Error).message);
      }
    }
    if (members.length === 0) {
      members = fallbackUsers.map((u) => ({
        userId: String(u.id),
        name: u.fullName,
        email: u.email || `${u.username}@local`,
        username: u.username,
        role: u.role,
        status: u.status,
        staffAccess: u.staffAccess,
        permissions: u.permissions,
      }));
    }
    res.json(members);
  } catch (error) {
    next(error);
  }
});

router.patch("/staff/users/:userId", requireOwner, async (req, res, next) => {
  try {
    const userIdNum = parseInt(String(req.params.userId), 10);
    const { staffAccess, permissions, status } = req.body || {};

    let target: any = null;
    if (process.env.DATABASE_URL) {
      try {
        const existing = await db.select().from(usersTable).where(eq(usersTable.id, userIdNum)).limit(1);
        if (existing.length > 0) target = existing[0];
      } catch {}
    }
    if (!target) {
      target = fallbackUsers.find((u) => u.id === userIdNum) || null;
    }

    if (!target) {
      res.status(404).json({ error: "الموظف غير موجود" });
      return;
    }

    if (target.role === "owner") {
      res.status(400).json({ error: "لا يمكن تعديل صلاحيات حساب المالك من هنا" });
      return;
    }

    const nextStatus = status || (staffAccess ? "approved" : (staffAccess === false ? "rejected" : target.status));
    const nextAccess = staffAccess !== undefined ? Boolean(staffAccess) : (nextStatus === "approved");
    const nextPermissions = permissions !== undefined ? permissions : target.permissions;

    let updated: any = null;
    if (process.env.DATABASE_URL) {
      try {
        const [dbUpdated] = await db
          .update(usersTable)
          .set({
            staffAccess: nextAccess,
            status: nextStatus,
            permissions: nextPermissions,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userIdNum))
          .returning();
        if (dbUpdated) updated = dbUpdated;
      } catch {}
    }

    const memUser = fallbackUsers.find((u) => u.id === userIdNum);
    if (memUser) {
      memUser.staffAccess = nextAccess;
      memUser.status = nextStatus;
      memUser.permissions = nextPermissions as StaffPermission[];
      memUser.updatedAt = new Date();
      if (!updated) updated = memUser;
    }

    if (!updated) {
      updated = {
        id: userIdNum,
        fullName: target.fullName,
        email: target.email,
        username: target.username,
        role: target.role,
        status: nextStatus,
        staffAccess: nextAccess,
        permissions: nextPermissions,
      };
    }

    res.json({
      userId: String(updated.id),
      name: updated.fullName,
      email: updated.email || `${updated.username}@local`,
      username: updated.username,
      role: updated.role,
      status: updated.status,
      staffAccess: updated.staffAccess,
      permissions: updated.permissions as StaffPermission[],
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/staff/users/:userId", requireOwner, async (req, res, next) => {
  try {
    const userIdNum = parseInt(String(req.params.userId), 10);
    if (userIdNum === 1) {
      res.status(400).json({ error: "لا يمكن حذف حساب المالك" });
      return;
    }

    if (process.env.DATABASE_URL) {
      try {
        await db.delete(usersTable).where(eq(usersTable.id, userIdNum));
      } catch {}
    }

    const idx = fallbackUsers.findIndex((u) => u.id === userIdNum);
    if (idx !== -1) {
      fallbackUsers.splice(idx, 1);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export function parseDepositAmount(val: unknown): number {
  if (typeof val === "number") return isNaN(val) ? 0 : Math.max(0, val);
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫|,/g, ".")
    .replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.max(0, num);
}

export const numberValue = (value: string | number | null | undefined): number => {
  const n = Number(value ?? 0);
  return isNaN(n) ? 0 : n;
};

export function getDefaultSweetImage(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("كعك") || n.includes("كحك") || n.includes("kahk")) {
    return "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("غريبة") || n.includes("غريبه") || n.includes("ghorayeba")) {
    return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("بيتي فور") || n.includes("بتيفور") || n.includes("petit four")) {
    return "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("بسكوت") || n.includes("بسكويت") || n.includes("نشادر") || n.includes("biscuit")) {
    return "https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("معمول") || n.includes("تمر") || n.includes("maamoul")) {
    return "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("سابليه") || n.includes("سابلي") || n.includes("sable")) {
    return "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=800&q=80";
  }
  return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80";
}

const toCategory = (row: typeof categoriesTable.$inferSelect) => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  pricePerUnit: numberValue(row.pricePerUnit),
  stockQuantity: numberValue(row.stockQuantity),
  lowStockThreshold: numberValue(row.lowStockThreshold),
  imageUrl: row.imageUrl || getDefaultSweetImage(row.name),
  isActive: row.isActive,
});

const toOrderItem = (
  row: typeof orderItemsTable.$inferSelect,
  category?: (typeof categoriesTable.$inferSelect) | null,
) => {
  const fallbackCat = fallbackCategories.find((c) => c.id === row.categoryId);
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: category?.name ?? fallbackCat?.name ?? "حلويات العيد",
    unit: category?.unit ?? fallbackCat?.unit ?? "box",
    quantity: numberValue(row.quantity),
    subtotal: numberValue(row.subtotal),
  };
};

interface FallbackCategory {
  id: number;
  name: string;
  unit: "kilo" | "box" | "piece";
  pricePerUnit: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  isActive: boolean;
}

interface FallbackOrderItem {
  id: number;
  categoryId: number;
  categoryName: string;
  unit: string;
  quantity: number;
  subtotal: number;
}

interface FallbackOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  phoneNumber: string;
  pickupDate: string;
  pickupTime: string;
  status: "pending" | "accepted" | "rejected" | "preparing" | "ready" | "delivered";
  notes?: string;
  totalPrice: number;
  depositAmount: number;
  remainingBalance: number;
  paymentMethod: string;
  paymentStatus: string;
  createdBy: "guest" | "admin";
  createdAt: string;
  items: FallbackOrderItem[];
}

export const fallbackCategories: FallbackCategory[] = [
  {
    id: 1,
    name: "كعك سادة فاخر",
    unit: "kilo",
    pricePerUnit: 240,
    stockQuantity: 32,
    lowStockThreshold: 8,
    imageUrl: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 2,
    name: "غريبة فاخرة بالسمن البلدي",
    unit: "kilo",
    pricePerUnit: 280,
    stockQuantity: 18,
    lowStockThreshold: 6,
    imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 3,
    name: "بيتي فور مشكل فاخر",
    unit: "box",
    pricePerUnit: 220,
    stockQuantity: 24,
    lowStockThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 4,
    name: "بسكوت نشادر مقرمش",
    unit: "kilo",
    pricePerUnit: 170,
    stockQuantity: 15,
    lowStockThreshold: 4,
    imageUrl: "https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 5,
    name: "معمول بالتمر والمكسرات",
    unit: "kilo",
    pricePerUnit: 260,
    stockQuantity: 20,
    lowStockThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 6,
    name: "سابليه شوكولاتة ومربى",
    unit: "box",
    pricePerUnit: 250,
    stockQuantity: 22,
    lowStockThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
];

export const fallbackOrders: FallbackOrder[] = [];
let nextFallbackOrderId = 200;

async function ensureSeedCategories() {
  if (!process.env.DATABASE_URL) return;
  try {
    await ensureDatabaseSchema();
    const existing = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .limit(1);

    if (existing.length === 0) {
      await db.insert(categoriesTable).values(
        fallbackCategories.map((c) => ({
          name: c.name,
          unit: c.unit,
          pricePerUnit: String(c.pricePerUnit),
          stockQuantity: String(c.stockQuantity),
          lowStockThreshold: String(c.lowStockThreshold),
          imageUrl: c.imageUrl,
          isActive: c.isActive,
        })),
      );
    }
  } catch (err) {
    console.error("Database seed categories error:", err);
  }
}

async function getOrderById(id: number) {
  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (order) {
        const items = await db
          .select()
          .from(orderItemsTable)
          .leftJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
          .where(eq(orderItemsTable.orderId, id))
          .orderBy(asc(orderItemsTable.id));

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          phoneNumber: order.phoneNumber,
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime,
          status: order.status,
          notes: order.notes,
          totalPrice: numberValue(order.totalPrice),
          depositAmount: numberValue(order.depositAmount),
          remainingBalance: numberValue(order.remainingBalance),
          paymentMethod: order.paymentMethod || "cash",
          paymentStatus: order.paymentStatus || "unpaid",
          createdBy: order.createdBy,
          createdAt: order.createdAt.toISOString(),
          items: items.map(({ order_items: item, categories: category }) =>
            toOrderItem(item, category),
          ),
        };
      }
    } catch (err) {
      console.error("getOrderById DB error:", err);
    }
  }

  const mem = fallbackOrders.find((o) => o.id === id);
  return mem || null;
}

async function listOrderRecords(query: {
  status?: string;
  date?: string;
  search?: string;
  timeframe?: string;
}) {
  const getTodayStr = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const todayStr = getTodayStr();

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const filters = [];
      if (query.status) filters.push(eq(ordersTable.status, query.status as never));
      if (query.date) {
        filters.push(eq(ordersTable.pickupDate, query.date));
      } else if (query.timeframe === "today") {
        filters.push(
          or(
            eq(ordersTable.pickupDate, todayStr),
            sql`DATE(${ordersTable.createdAt} AT TIME ZONE 'Africa/Cairo') = ${todayStr}::date`
          )
        );
      } else if (query.timeframe === "week") {
        filters.push(
          or(
            sql`${ordersTable.pickupDate} >= TO_CHAR((NOW() AT TIME ZONE 'Africa/Cairo') - INTERVAL '7 days', 'YYYY-MM-DD')`,
            sql`${ordersTable.createdAt} >= NOW() - INTERVAL '7 days'`
          )
        );
      } else if (query.timeframe === "month") {
        filters.push(
          or(
            sql`${ordersTable.pickupDate} >= TO_CHAR((NOW() AT TIME ZONE 'Africa/Cairo') - INTERVAL '30 days', 'YYYY-MM-DD')`,
            sql`${ordersTable.createdAt} >= NOW() - INTERVAL '30 days'`
          )
        );
      }
      if (query.search) {
        filters.push(
          or(
            ilike(ordersTable.customerName, `%${query.search}%`),
            ilike(ordersTable.phoneNumber, `%${query.search}%`),
            ilike(ordersTable.orderNumber, `%${query.search}%`),
          ),
        );
      }

      const orders = await db
        .select()
        .from(ordersTable)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(ordersTable.createdAt));

      if (orders.length > 0) {
        const orderIds = orders.map((o) => o.id);
        const items = await db
          .select()
          .from(orderItemsTable)
          .leftJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
          .where(inArray(orderItemsTable.orderId, orderIds))
          .orderBy(asc(orderItemsTable.id));

        const itemsByOrderId = new Map<number, ReturnType<typeof toOrderItem>[]>();
        for (const { order_items: item, categories: category } of items) {
          const list = itemsByOrderId.get(item.orderId) ?? [];
          list.push(toOrderItem(item, category));
          itemsByOrderId.set(item.orderId, list);
        }

        return orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          phoneNumber: order.phoneNumber,
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime,
          status: order.status,
          notes: order.notes,
          totalPrice: numberValue(order.totalPrice),
          depositAmount: numberValue(order.depositAmount),
          remainingBalance: numberValue(order.remainingBalance),
          paymentMethod: order.paymentMethod || "cash",
          paymentStatus: order.paymentStatus || "unpaid",
          createdBy: order.createdBy,
          createdAt: order.createdAt.toISOString(),
          items: itemsByOrderId.get(order.id) ?? [],
        }));
      } else if (process.env.DATABASE_URL) {
        return [];
      }
    } catch (err) {
      console.error("listOrderRecords DB query error:", err);
    }
  }

  // Filter in-memory fallbackOrders
  let list = [...fallbackOrders];
  if (query.status) list = list.filter((o) => o.status === query.status);
  if (query.date) {
    list = list.filter((o) => o.pickupDate === query.date);
  } else if (query.timeframe === 'today') {
    list = list.filter((o) => o.pickupDate === todayStr || (o.createdAt && o.createdAt.slice(0, 10) === todayStr));
  } else if (query.timeframe === 'week') {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    list = list.filter((o) => {
      const d = new Date(o.pickupDate || o.createdAt);
      return !isNaN(d.getTime()) && d >= weekAgo;
    });
  } else if (query.timeframe === 'month') {
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    list = list.filter((o) => {
      const d = new Date(o.pickupDate || o.createdAt);
      return !isNaN(d.getTime()) && d >= monthAgo;
    });
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    list = list.filter(
      (o) =>
        o.customerName.toLowerCase().includes(s) ||
        o.phoneNumber.includes(s) ||
        o.orderNumber.toLowerCase().includes(s),
    );
  }
  return list;
}

router.get("/categories", async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      await ensureSeedCategories();
      const rows = await db
        .select()
        .from(categoriesTable)
        .orderBy(asc(categoriesTable.id));
      if (rows.length > 0) {
        res.json(rows.map(toCategory));
        return;
      }
    }
  } catch (error) {
    console.warn("DB categories query failed, serving fallback:", (error as Error).message);
  }
  res.json(fallbackCategories.filter((c) => c.isActive !== false));
});

router.post("/categories", requirePermission("inventory"), async (req, res, next) => {
  try {
    const input = CreateCategoryBody.parse(req.body);
    if (process.env.DATABASE_URL) {
      try {
        await ensureDatabaseSchema();
        const [created] = await db
          .insert(categoriesTable)
          .values({
            ...input,
            pricePerUnit: String(input.pricePerUnit),
            stockQuantity: String(input.stockQuantity),
            lowStockThreshold: String(input.lowStockThreshold ?? 5),
          })
          .returning();
        res.status(201).json(toCategory(created));
        return;
      } catch (dbErr) {
        console.error("POST /categories DB insert failed:", dbErr);
        res.status(500).json({ error: "فشل إضافة الصنف في قاعدة البيانات" });
        return;
      }
    }
    const created: FallbackCategory = {
      id: fallbackCategories.length + 1,
      name: input.name,
      unit: input.unit,
      pricePerUnit: input.pricePerUnit,
      stockQuantity: input.stockQuantity,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      imageUrl: input.imageUrl || getDefaultSweetImage(input.name),
      isActive: (input as any).isActive ?? true,
    };
    fallbackCategories.push(created);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const { categoryId } = UpdateCategoryParams.parse(req.params);
    const input = UpdateCategoryBody.parse(req.body);

    if (process.env.DATABASE_URL) {
      try {
        await ensureDatabaseSchema();
        const categoryPatch: Partial<typeof categoriesTable.$inferInsert> = {};
        if (input.name !== undefined) categoryPatch.name = input.name;
        if (input.unit !== undefined) categoryPatch.unit = input.unit;
        if (input.isActive !== undefined) categoryPatch.isActive = input.isActive;
        if (input.pricePerUnit !== undefined) {
          categoryPatch.pricePerUnit = String(input.pricePerUnit);
        }
        if (input.stockQuantity !== undefined) {
          categoryPatch.stockQuantity = String(input.stockQuantity);
        }
        if (input.lowStockThreshold !== undefined) {
          categoryPatch.lowStockThreshold = String(input.lowStockThreshold);
        }
        const [updated] = await db
          .update(categoriesTable)
          .set(categoryPatch)
          .where(eq(categoriesTable.id, categoryId))
          .returning();
        if (!updated) {
          res.status(404).json({ error: "Category not found" });
          return;
        }
        res.json(toCategory(updated));
        return;
      } catch (dbErr) {
        console.error("PATCH /categories/:id DB update failed:", dbErr);
        res.status(500).json({ error: "فشل تحديث الصنف في قاعدة البيانات" });
        return;
      }
    }

    // In-memory fallback
    const memCat = fallbackCategories.find((c) => c.id === categoryId);
    if (!memCat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    if (input.name !== undefined) memCat.name = input.name;
    if (input.unit !== undefined) memCat.unit = input.unit;
    if (input.pricePerUnit !== undefined) memCat.pricePerUnit = input.pricePerUnit;
    if (input.stockQuantity !== undefined) memCat.stockQuantity = input.stockQuantity;
    if (input.lowStockThreshold !== undefined) memCat.lowStockThreshold = input.lowStockThreshold;
    if (input.imageUrl !== undefined) memCat.imageUrl = input.imageUrl;
    if (input.isActive !== undefined) memCat.isActive = input.isActive;
    res.json(memCat);
  } catch (error) {
    next(error);
  }
});

router.delete("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const { categoryId } = DeleteCategoryParams.parse(req.params);
    if (process.env.DATABASE_URL) {
      try {
        await ensureDatabaseSchema();
        const [updated] = await db
          .update(categoriesTable)
          .set({ isActive: false })
          .where(eq(categoriesTable.id, categoryId))
          .returning({ id: categoriesTable.id });
        if (!updated) {
          res.status(404).json({ error: "Category not found" });
          return;
        }
        res.status(204).send();
        return;
      } catch (dbErr) {
        console.error("DELETE /categories/:id DB update failed:", dbErr);
        res.status(500).json({ error: "فشل حذف الصنف من قاعدة البيانات" });
        return;
      }
    }

    // In-memory fallback
    const memCat = fallbackCategories.find((c) => c.id === categoryId);
    if (!memCat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    memCat.isActive = false;
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/orders", requirePermission("orders"), async (req, res, next) => {
  try {
    const rawQuery: Record<string, unknown> = { ...req.query };
    if (typeof rawQuery.date === "string" && rawQuery.date.trim()) {
      const parsedDate = new Date(rawQuery.date);
      if (!isNaN(parsedDate.getTime())) {
        rawQuery.date = parsedDate;
      }
    }
    const query = ListOrdersQueryParams.parse(rawQuery);
    const timeframe = typeof req.query.timeframe === "string" ? req.query.timeframe : undefined;
    res.json(
      await listOrderRecords({
        ...query,
        date:
          query.date instanceof Date
            ? query.date.toISOString().slice(0, 10)
            : typeof req.query.date === "string"
            ? req.query.date
            : undefined,
        timeframe,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    // Limit to 30 orders per 10 minutes per IP
    if (!checkRateLimit(orderRateLimits, ip, 30, 10 * 60 * 1000)) {
      res.status(429).json({ error: "تم إرسال عدد كبير من الطلبات. يرجى الانتظار بضع دقائق." });
      return;
    }

    const input = CreateOrderBody.parse(req.body);

    if (process.env.DATABASE_URL) {
      try {
        await ensureSeedCategories();
        let dbCategories = await db
          .select()
          .from(categoriesTable)
          .where(eq(categoriesTable.isActive, true));

        if (dbCategories.length === 0) {
          dbCategories = await db.select().from(categoriesTable);
        }

        // Remap any item categoryId if needed (e.g. client sent fallback ID 1..6 or stale ID)
        for (const item of input.items) {
          let matched = dbCategories.find((c) => c.id === item.categoryId);
          if (!matched) {
            const fbCat = fallbackCategories.find((fc) => fc.id === item.categoryId);
            if (fbCat) {
              const matchedByName = dbCategories.find(
                (c) => c.name.trim().toLowerCase() === fbCat.name.trim().toLowerCase(),
              );
              if (matchedByName) {
                item.categoryId = matchedByName.id;
                matched = matchedByName;
              }
            }
          }
          if (!matched) {
            res.status(400).json({ error: `الصنف المختار غير متوفر (رقم الصنف: ${item.categoryId})` });
            return;
          }
        }

        const categoryMap = new Map(dbCategories.map((c) => [c.id, c]));
        const quantityByCategoryId = new Map<number, number>();
        for (const item of input.items) {
          quantityByCategoryId.set(
            item.categoryId,
            (quantityByCategoryId.get(item.categoryId) ?? 0) + item.quantity,
          );
        }

        for (const [catId, demandedQty] of quantityByCategoryId.entries()) {
          const category = categoryMap.get(catId);
          if (category && numberValue(category.stockQuantity) < demandedQty) {
            res.status(400).json({
              error: `الكمية المتاحة من "${category.name}" غير كافية. المتاح حالياً: ${category.stockQuantity}`,
            });
            return;
          }
        }

        const authUser = await getAuthenticatedUser(req);
        const effectiveCreatedBy =
          authUser && hasStaffAccess(authUser) && input.createdBy === "admin"
            ? "admin"
            : "guest";

        const preparedItems = input.items.map((item) => {
          const category = categoryMap.get(item.categoryId)!;
          const subtotal = item.quantity * numberValue(category.pricePerUnit);
          return { ...item, subtotal };
        });
        const totalPrice = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);
        const depositAmount = Math.max(0, Number((input as any).depositAmount ?? 0));
        const remainingBalance = Math.max(0, totalPrice - depositAmount);
        const paymentMethod = (input as any).paymentMethod || "cash";
        const paymentStatus =
          (input as any).paymentStatus ||
          (depositAmount >= totalPrice && totalPrice > 0
            ? "paid"
            : depositAmount > 0
            ? "partially_paid"
            : "unpaid");

        const createdId = await db.transaction(async (tx) => {
          const orderNumber = `EID-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const [created] = await tx
            .insert(ordersTable)
            .values({
              orderNumber,
              customerName: input.customerName,
              phoneNumber: input.phoneNumber,
              pickupDate:
                input.pickupDate instanceof Date
                  ? input.pickupDate.toISOString().slice(0, 10)
                  : input.pickupDate,
              pickupTime: input.pickupTime,
              notes: input.notes || null,
              totalPrice: totalPrice.toFixed(2),
              depositAmount: depositAmount.toFixed(2),
              remainingBalance: remainingBalance.toFixed(2),
              paymentMethod,
              paymentStatus,
              createdBy: effectiveCreatedBy,
            })
            .returning({ id: ordersTable.id });

          await tx.insert(orderItemsTable).values(
            preparedItems.map((item) => ({
              orderId: created.id,
              categoryId: item.categoryId,
              quantity: String(item.quantity),
              subtotal: item.subtotal.toFixed(2),
            })),
          );

          for (const [catId, demandedQty] of quantityByCategoryId.entries()) {
            const updatedRows = await tx
              .update(categoriesTable)
              .set({
                stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric - ${demandedQty})::numeric(10,2)`,
              })
              .where(
                and(
                  eq(categoriesTable.id, catId),
                  sql`${categoriesTable.stockQuantity}::numeric >= ${demandedQty}`,
                ),
              )
              .returning({ id: categoriesTable.id });

            if (updatedRows.length === 0) {
              const [cat] = await tx
                .select({ name: categoriesTable.name })
                .from(categoriesTable)
                .where(eq(categoriesTable.id, catId))
                .limit(1);
              const catName = cat?.name || `الصنف رقم ${catId}`;
              throw new InsufficientStockError(`الكمية المتوفرة من "${catName}" غير كافية لإتمام الطلب`);
            }
          }

          return created.id;
        });

        const order = await getOrderById(createdId);
        if (order) {
          res.status(201).json(order);
          return;
        }
        res.status(500).json({ error: "تعذر استرجاع بيانات الطلب بعد حفظه في قاعدة البيانات" });
        return;
      } catch (dbErr) {
        console.error("POST /orders database execution failed:", dbErr);
        if (dbErr instanceof InsufficientStockError) {
          res.status(409).json({ error: dbErr.message });
          return;
        }
        res.status(500).json({
          error: "فشل حفظ الطلب في قاعدة البيانات. يرجى المحاولة مرة أخرى.",
          details: process.env.NODE_ENV !== "production" ? (dbErr as Error).message : undefined,
        });
        return;
      }
    }

    // In-memory fallback (only for local development when no DATABASE_URL is configured)
    const fallbackOrderNumber = `EID-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const pickupDateStr =
      input.pickupDate instanceof Date
        ? input.pickupDate.toISOString().slice(0, 10)
        : String(input.pickupDate);

    const memoryItems: FallbackOrderItem[] = input.items.map((item, idx) => {
      const cat = fallbackCategories.find((c) => c.id === item.categoryId);
      const price = cat ? cat.pricePerUnit : 180;
      return {
        id: idx + 1,
        categoryId: item.categoryId,
        categoryName: cat?.name || "حلويات العيد",
        unit: cat?.unit || "box",
        quantity: item.quantity,
        subtotal: item.quantity * price,
      };
    });

    const totalPrice = memoryItems.reduce((sum, item) => sum + item.subtotal, 0);
    const depositAmount = Math.max(0, Number((input as any).depositAmount ?? 0));
    const remainingBalance = Math.max(0, totalPrice - depositAmount);

    const newOrder: FallbackOrder = {
      id: ++nextFallbackOrderId,
      orderNumber: fallbackOrderNumber,
      customerName: input.customerName,
      phoneNumber: input.phoneNumber,
      pickupDate: pickupDateStr,
      pickupTime: input.pickupTime,
      status: "pending",
      notes: input.notes,
      totalPrice,
      depositAmount,
      remainingBalance,
      paymentMethod: (input as any).paymentMethod || "cash",
      paymentStatus: (input as any).paymentStatus || "unpaid",
      createdBy: "guest",
      createdAt: new Date().toISOString(),
      items: memoryItems,
    };

    fallbackOrders.unshift(newOrder);
    res.status(201).json(newOrder);
  } catch (error) {
    next(error);
  }
});

router.get("/orders/track", async (req, res, next) => {
  try {
    const query = TrackOrderQueryParams.parse(req.query);
    const orderNum = query.orderNumber ? query.orderNumber.trim().toLowerCase() : "";
    const rawPhone = query.phone ? query.phone.trim() : "";
    const cleanPhone = rawPhone.replace(/\D/g, "");

    if (!orderNum && !rawPhone) {
      res.status(400).json({ error: "orderNumber or phone is required to track an order" });
      return;
    }

    if (!orderNum && cleanPhone.length < 10) {
      res.status(400).json({ error: "رقم الهاتف غير صالح للبحث (يجب أن يتكون من 10 أرقام على الأقل)" });
      return;
    }

    if (process.env.DATABASE_URL) {
      try {
        const conditions = [];
        if (orderNum) {
          conditions.push(sql`LOWER(${ordersTable.orderNumber}) = LOWER(${query.orderNumber!.trim()})`);
        }
        if (cleanPhone.length >= 10) {
          conditions.push(
            or(
              eq(ordersTable.phoneNumber, rawPhone),
              sql`REGEXP_REPLACE(${ordersTable.phoneNumber}, '[^0-9]', '', 'g') = ${cleanPhone}`,
            ),
          );
        }

        const matchingOrders = await db
          .select()
          .from(ordersTable)
          .where(or(...conditions))
          .orderBy(desc(ordersTable.createdAt))
          .limit(10);

        if (matchingOrders.length > 0) {
          const orderIds = matchingOrders.map((o) => o.id);
          const items = await db
            .select()
            .from(orderItemsTable)
            .leftJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
            .where(inArray(orderItemsTable.orderId, orderIds))
            .orderBy(asc(orderItemsTable.id));

          const itemsByOrderId = new Map<number, ReturnType<typeof toOrderItem>[]>();
          for (const { order_items: item, categories: category } of items) {
            const list = itemsByOrderId.get(item.orderId) ?? [];
            list.push(toOrderItem(item, category));
            itemsByOrderId.set(item.orderId, list);
          }

          res.json(
            matchingOrders.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              phoneNumber: order.phoneNumber,
              pickupDate: order.pickupDate,
              pickupTime: order.pickupTime,
              status: order.status,
              notes: order.notes,
              totalPrice: numberValue(order.totalPrice),
              depositAmount: numberValue(order.depositAmount),
              remainingBalance: numberValue(order.remainingBalance),
              paymentMethod: order.paymentMethod || "cash",
              paymentStatus: order.paymentStatus || "unpaid",
              createdBy: order.createdBy,
              createdAt: order.createdAt.toISOString(),
              items: itemsByOrderId.get(order.id) ?? [],
            })),
          );
          return;
        }
        res.json([]);
        return;
      } catch (err) {
        console.error("GET /orders/track DB error:", err);
        res.status(500).json({ error: "فشل البحث عن الطلب في قاعدة البيانات" });
        return;
      }
    }

    const matched = fallbackOrders
      .filter((o) => {
        const matchNum = orderNum && o.orderNumber.toLowerCase() === orderNum;
        const matchPhone =
          cleanPhone.length >= 10 &&
          (o.phoneNumber === rawPhone || o.phoneNumber.replace(/\D/g, "") === cleanPhone);
        return matchNum || matchPhone;
      })
      .slice(0, 10);
    res.json(matched);
  } catch (error) {
    next(error);
  }
});

export const sanitizeCsvCell = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '""';
  const text = String(val).replace(/[\r\n]+/g, " ").trim();
  // Neutralize formula injection triggers: =, +, -, @, %, |
  const safe = /^[=+\-@%|]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

router.get("/orders/export", requirePermission("orders"), async (req, res, next) => {
  try {
    const { range } = ExportOrdersQueryParams.parse(req.query);
    const start = new Date();
    if (range === "day") start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - 6);
    const orders = await listOrderRecords({ date: undefined });
    const filtered = orders.filter((order) => new Date(order.createdAt) >= start);
    const lines = [
      ["رقم الطلب", "الاسم", "الموبايل", "الاستلام", "الحالة", "الإجمالي", "العربون", "المتبقي", "طريقة الدفع", "حالة الدفع"].join(","),
      ...filtered.map((order) =>
        [
          sanitizeCsvCell(order.orderNumber),
          sanitizeCsvCell(order.customerName),
          sanitizeCsvCell(order.phoneNumber),
          sanitizeCsvCell(`${order.pickupDate} ${order.pickupTime}`),
          sanitizeCsvCell(order.status),
          sanitizeCsvCell(order.totalPrice.toFixed(2)),
          sanitizeCsvCell((order as any).depositAmount?.toFixed(2) ?? "0.00"),
          sanitizeCsvCell((order as any).remainingBalance?.toFixed(2) ?? "0.00"),
          sanitizeCsvCell((order as any).paymentMethod ?? "cash"),
          sanitizeCsvCell((order as any).paymentStatus ?? "unpaid"),
        ].join(","),
      ),
    ];
    res.type("text/csv; charset=utf-8").send(`\uFEFF${lines.join("\n")}`);
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:orderId", requirePermission("orders"), async (req, res, next) => {
  try {
    const { orderId } = GetOrderParams.parse(req.params);
    const order = await getOrderById(orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:orderId", requirePermission("orders"), async (req, res, next) => {
  try {
    const { orderId } = UpdateOrderParams.parse(req.params);
    if (req.body && typeof req.body === "object") {
      if ((req.body as any).depositAmount !== undefined) {
        (req.body as any).depositAmount = parseDepositAmount((req.body as any).depositAmount);
      }
      if ((req.body as any).remainingBalance !== undefined) {
        (req.body as any).remainingBalance = parseDepositAmount((req.body as any).remainingBalance);
      }
    }
    const input = UpdateOrderBody.parse(req.body);
    if (process.env.DATABASE_URL) {
      try {
        await ensureDatabaseSchema();
        const orderPatch: Partial<typeof ordersTable.$inferInsert> = {};
        if (input.customerName !== undefined) orderPatch.customerName = input.customerName;
        if (input.phoneNumber !== undefined) orderPatch.phoneNumber = input.phoneNumber;
        if (input.pickupDate !== undefined) {
          orderPatch.pickupDate =
            input.pickupDate instanceof Date
              ? input.pickupDate.toISOString().slice(0, 10)
              : input.pickupDate;
        }
        if (input.pickupTime !== undefined) orderPatch.pickupTime = input.pickupTime;
        if (input.notes !== undefined) orderPatch.notes = input.notes;
        if (input.status !== undefined) orderPatch.status = input.status;
        const [existingOrder] = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .limit(1);

        if (existingOrder) {
          const total = numberValue(existingOrder.totalPrice);
          if ((input as any).depositAmount !== undefined) {
            const rawDep = parseDepositAmount((input as any).depositAmount);
            const dep = Math.min(total, rawDep);
            orderPatch.depositAmount = dep.toFixed(2);
            const rem = (input as any).remainingBalance !== undefined
              ? parseDepositAmount((input as any).remainingBalance)
              : Math.max(0, total - dep);
            orderPatch.remainingBalance = rem.toFixed(2);
            if (!(input as any).paymentStatus) {
              orderPatch.paymentStatus = rem <= 0 && total > 0 ? "paid" : dep > 0 ? "partially_paid" : "unpaid";
            }
          } else if ((input as any).remainingBalance !== undefined) {
            orderPatch.remainingBalance = parseDepositAmount((input as any).remainingBalance).toFixed(2);
          }
          if ((input as any).paymentMethod !== undefined) {
            orderPatch.paymentMethod = String((input as any).paymentMethod);
          }
          if ((input as any).paymentStatus !== undefined) {
            orderPatch.paymentStatus = String((input as any).paymentStatus);
          }

          if (input.status === "rejected" && existingOrder.status !== "rejected") {
            const items = await db
              .select()
              .from(orderItemsTable)
              .where(eq(orderItemsTable.orderId, orderId));

            for (const item of items) {
              await db
                .update(categoriesTable)
                .set({
                  stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric + ${item.quantity})::numeric(10,2)`,
                })
                .where(eq(categoriesTable.id, item.categoryId));
            }
          }

          const [updated] = await db
            .update(ordersTable)
            .set(orderPatch)
            .where(eq(ordersTable.id, orderId))
            .returning({ id: ordersTable.id });
          if (updated) {
            const result = await getOrderById(updated.id);
            res.json(result);
            return;
          }
        }
        res.status(404).json({ error: "Order not found" });
        return;
      } catch (dbErr) {
        console.error("DB order patch failed:", dbErr);
        res.status(500).json({ error: "Failed to update order in database" });
        return;
      }
    }

    // In-memory fallback
    const memOrder = fallbackOrders.find((o) => o.id === orderId);
    if (!memOrder) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const total = memOrder.totalPrice;
    if (input.customerName !== undefined) memOrder.customerName = input.customerName;
    if (input.phoneNumber !== undefined) memOrder.phoneNumber = input.phoneNumber;
    if (input.pickupDate !== undefined) {
      memOrder.pickupDate =
        input.pickupDate instanceof Date
          ? input.pickupDate.toISOString().slice(0, 10)
          : input.pickupDate;
    }
    if (input.pickupTime !== undefined) memOrder.pickupTime = input.pickupTime;
    if (input.notes !== undefined) memOrder.notes = input.notes;
    if (input.status !== undefined) memOrder.status = input.status;
    if ((input as any).depositAmount !== undefined) {
      const rawDep = parseDepositAmount((input as any).depositAmount);
      const dep = Math.min(total, rawDep);
      memOrder.depositAmount = dep;
      const rem = (input as any).remainingBalance !== undefined
        ? parseDepositAmount((input as any).remainingBalance)
        : Math.max(0, total - dep);
      memOrder.remainingBalance = rem;
      if (!(input as any).paymentStatus) {
        memOrder.paymentStatus = rem <= 0 && total > 0 ? "paid" : dep > 0 ? "partially_paid" : "unpaid";
      }
    } else if ((input as any).remainingBalance !== undefined) {
      memOrder.remainingBalance = parseDepositAmount((input as any).remainingBalance);
    }
    if ((input as any).paymentMethod !== undefined) memOrder.paymentMethod = String((input as any).paymentMethod);
    if ((input as any).paymentStatus !== undefined) memOrder.paymentStatus = String((input as any).paymentStatus);
    res.json(memOrder);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/summary", requirePermission("analytics"), async (_req, res, next) => {
  try {
    const getLocalTodayString = () => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    };
    const today = getLocalTodayString();
    let orders: any[] = [];
    let categories: any[] = [];
    if (process.env.DATABASE_URL) {
      try {
        await ensureSeedCategories();
        [orders, categories] = await Promise.all([
          listOrderRecords({}),
          db.select().from(categoriesTable),
        ]);
      } catch {
        orders = await listOrderRecords({});
        categories = fallbackCategories as any[];
      }
    } else {
      orders = await listOrderRecords({});
      categories = fallbackCategories as any[];
    }
    const acceptedRevenue = orders
      .filter((order) => ["accepted", "preparing", "ready", "delivered"].includes(order.status))
      .reduce((sum, order) => sum + order.totalPrice, 0);
    const topByQuantity = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items) {
        topByQuantity.set(
          item.categoryName,
          (topByQuantity.get(item.categoryName) ?? 0) + item.quantity,
        );
      }
    }
    const topCategory = [...topByQuantity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const now = new Date();
    let eid: Date | null = null;
    if (process.env.EID_TARGET_DATE) {
      const configured = new Date(process.env.EID_TARGET_DATE);
      if (!isNaN(configured.getTime()) && configured.getTime() > now.getTime()) {
        eid = configured;
      }
    }
    if (!eid) {
      const candidateYear = now.getFullYear();
      const thisYearEid = new Date(`${candidateYear}-03-31T00:00:00Z`);
      const targetYear = now.getTime() >= thisYearEid.getTime() ? candidateYear + 1 : candidateYear;
      eid = new Date(`${targetYear}-03-31T00:00:00Z`);
    }
    const daysUntilEid = Math.max(
      0,
      Math.ceil((eid.getTime() - now.getTime()) / 86_400_000),
    );
    res.json({
      pendingOrders: orders.filter((order) => order.status === "pending").length,
      todayOrders: orders.filter((order) => order.pickupDate === today).length,
      acceptedRevenue: Number(acceptedRevenue.toFixed(2)),
      lowStockCount: categories.filter((category) => numberValue(category.stockQuantity) <= numberValue(category.lowStockThreshold)).length,
      totalOrders: orders.length,
      topCategory,
      daysUntilEid,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/analytics", requirePermission("analytics"), async (_req, res, next) => {
  try {
    const orders = await listOrderRecords({});
    const daily = new Map<string, { orders: number; revenue: number }>();
    const categoryTotals = new Map<string, { quantity: number; revenue: number }>();
    const statusTotals = new Map<string, number>();

    for (const order of orders) {
      const day = daily.get(order.pickupDate) ?? { orders: 0, revenue: 0 };
      day.orders += 1;
      day.revenue += order.totalPrice;
      daily.set(order.pickupDate, day);
      statusTotals.set(order.status, (statusTotals.get(order.status) ?? 0) + 1);
      for (const item of order.items) {
        const current = categoryTotals.get(item.categoryName) ?? { quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += item.subtotal;
        categoryTotals.set(item.categoryName, current);
      }
    }

    res.json({
      dailyOrders: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date,
          orders: values.orders,
          revenue: Number(values.revenue.toFixed(2)),
        })),
      categoryTotals: [...categoryTotals.entries()]
        .sort(([, a], [, b]) => b.quantity - a.quantity)
        .map(([categoryName, values]) => ({
          categoryName,
          quantity: values.quantity,
          revenue: Number(values.revenue.toFixed(2)),
        })),
      statusTotals: [...statusTotals.entries()].map(([status, count]) => ({ status, count })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;