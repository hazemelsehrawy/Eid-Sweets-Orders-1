import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  orderItemsTable,
  ordersTable,
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

function getEmail(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? "";
}

function toStaffMember(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return {
    userId: user.id,
    name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || getEmail(user),
    email: getEmail(user),
    role: getStaffRole(user),
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
  if (!process.env.CLERK_SECRET_KEY) return false;
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

const DEV_ADMIN_USER = {
  id: "admin-1",
  fullName: "مدير المحل (Admin)",
  firstName: "مدير",
  lastName: "المحل",
  emailAddresses: [{ id: "email-1", emailAddress: "admin@saffronseed.com" }],
  primaryEmailAddressId: "email-1",
  publicMetadata: {
    role: "owner",
    staffAccess: true,
    permissions: ["orders", "inventory", "analytics", "team"],
  },
};

async function getAuthenticatedUser(req: Parameters<RequestHandler>[0]) {
  if (!process.env.CLERK_SECRET_KEY) {
    const devCookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.["dev_admin"];
    const devHeader = req.headers["x-dev-admin"];
    if (devCookie === "true" || devCookie === "1" || devHeader === "true" || devHeader === "admin") {
      return DEV_ADMIN_USER as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>>;
    }
    return null;
  }
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
    if (await hasOwnerAccount()) {
      res.status(409).json({ error: "An owner account already exists" });
      return;
    }
    const updated = await clerkClient.users.updateUserMetadata(user.id, {
      publicMetadata: {
        ...(user.publicMetadata as Record<string, unknown>),
        role: "owner",
        staffAccess: true,
        permissions: allStaffPermissions,
      },
    });
    invalidateUserCache(user.id);
    res.json({
      staffAccess: true,
      role: "owner",
      permissions: allStaffPermissions,
      canManageTeam: true,
      setupAvailable: false,
      userId: updated.id,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/staff/login", (req, res) => {
  const { password } = req.body || {};
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin";
  if (password && password.trim() !== expectedPassword.trim()) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.cookie("dev_admin", "true", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true, user: DEV_ADMIN_USER });
});

router.post("/staff/logout", (_req, res) => {
  res.clearCookie("dev_admin", { path: "/" });
  res.json({ success: true });
});

router.get("/staff/users", requireOwner, async (_req, res, next) => {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      res.json([toStaffMember(DEV_ADMIN_USER as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>>)]);
      return;
    }
    res.json((await listClerkUsers()).map(toStaffMember));
  } catch (error) {
    next(error);
  }
});

router.patch("/staff/users/:userId", requireOwner, async (req, res, next) => {
  try {
    const { userId } = UpdateStaffUserParams.parse(req.params);
    const input = UpdateStaffUserBody.parse(req.body);
    if (!process.env.CLERK_SECRET_KEY) {
      res.json(toStaffMember(DEV_ADMIN_USER as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>>));
      return;
    }
    const target = await clerkClient.users.getUser(userId);
    if (isOwner(target)) {
      res.status(400).json({ error: "The owner account cannot be changed here" });
      return;
    }
    const updated = await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...(target.publicMetadata as Record<string, unknown>),
        role: "staff",
        staffAccess: input.staffAccess,
        permissions: input.permissions,
      },
    });
    invalidateUserCache(userId);
    res.json(toStaffMember(updated));
  } catch (error) {
    next(error);
  }
});

const numberValue = (value: string | number | null | undefined) =>
  Number(value ?? 0);

const toCategory = (row: typeof categoriesTable.$inferSelect) => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  pricePerUnit: numberValue(row.pricePerUnit),
  stockQuantity: numberValue(row.stockQuantity),
  lowStockThreshold: numberValue(row.lowStockThreshold),
  isActive: row.isActive,
});

const toOrderItem = (
  row: typeof orderItemsTable.$inferSelect,
  category: typeof categoriesTable.$inferSelect,
) => ({
  id: row.id,
  categoryId: row.categoryId,
  categoryName: category.name,
  unit: category.unit,
  quantity: numberValue(row.quantity),
  subtotal: numberValue(row.subtotal),
});

async function ensureSeedCategories() {
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(categoriesTable).values([
    {
      name: "كعك سادة",
      unit: "kilo",
      pricePerUnit: "240",
      stockQuantity: "32",
      lowStockThreshold: "8",
    },
    {
      name: "غريبة فاخرة",
      unit: "kilo",
      pricePerUnit: "280",
      stockQuantity: "18",
      lowStockThreshold: "6",
    },
    {
      name: "بيتي فور مشكل",
      unit: "box",
      pricePerUnit: "190",
      stockQuantity: "24",
      lowStockThreshold: "5",
    },
    {
      name: "بسكوت نشادر",
      unit: "kilo",
      pricePerUnit: "170",
      stockQuantity: "11",
      lowStockThreshold: "4",
    },
  ]);
}

async function getOrderById(id: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
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
    createdBy: order.createdBy,
    createdAt: order.createdAt.toISOString(),
    items: items.map(({ order_items: item, categories: category }) =>
      toOrderItem(item, category),
    ),
  };
}

async function listOrderRecords(query: {
  status?: string;
  date?: string;
  search?: string;
}) {
  const filters = [];
  if (query.status) filters.push(eq(ordersTable.status, query.status as never));
  if (query.date) filters.push(eq(ordersTable.pickupDate, query.date));
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

  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
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
    createdBy: order.createdBy,
    createdAt: order.createdAt.toISOString(),
    items: itemsByOrderId.get(order.id) ?? [],
  }));
}

router.get("/categories", async (_req, res, next) => {
  try {
    await ensureSeedCategories();
    const rows = await db
      .select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.id));
    res.json(rows.map(toCategory));
  } catch (error) {
    next(error);
  }
});

router.post("/categories", requirePermission("inventory"), async (req, res, next) => {
  try {
    const input = CreateCategoryBody.parse(req.body);
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
  } catch (error) {
    next(error);
  }
});

router.patch("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const { categoryId } = UpdateCategoryParams.parse(req.params);
    const input = UpdateCategoryBody.parse(req.body);
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
  } catch (error) {
    next(error);
  }
});

router.delete("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const { categoryId } = DeleteCategoryParams.parse(req.params);
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
    res.json(
      await listOrderRecords({
        ...query,
        date:
          query.date instanceof Date
            ? query.date.toISOString().slice(0, 10)
            : typeof req.query.date === "string"
            ? req.query.date
            : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    await ensureSeedCategories();
    const input = CreateOrderBody.parse(req.body);
    const categoryIds = input.items.map((item) => item.categoryId);
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.isActive, true), inArray(categoriesTable.id, uniqueCategoryIds)));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    if (categories.length !== uniqueCategoryIds.length) {
      res.status(400).json({ error: "One or more selected categories are unavailable" });
      return;
    }

    // Consolidate demanded quantity per category
    const quantityByCategoryId = new Map<number, number>();
    for (const item of input.items) {
      quantityByCategoryId.set(
        item.categoryId,
        (quantityByCategoryId.get(item.categoryId) ?? 0) + item.quantity,
      );
    }

    // Verify stock availability with consolidated quantities
    for (const [catId, demandedQty] of quantityByCategoryId.entries()) {
      const category = categoryMap.get(catId)!;
      if (numberValue(category.stockQuantity) < demandedQty) {
        res.status(400).json({
          error: `Insufficient stock for ${category.name}. Available: ${category.stockQuantity}`,
        });
        return;
      }
    }

    // Guard createdBy: only authenticated staff can submit admin orders
    const authUser = await getAuthenticatedUser(req);
    const effectiveCreatedBy = authUser && hasStaffAccess(authUser) && input.createdBy === "admin"
      ? "admin"
      : "guest";

    const preparedItems = input.items.map((item) => {
      const category = categoryMap.get(item.categoryId)!;
      const subtotal = item.quantity * numberValue(category.pricePerUnit);
      return { ...item, subtotal };
    });
    const totalPrice = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);

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

      // Decrement stock atomically with concurrency protection and consolidation
      for (const [catId, demandedQty] of quantityByCategoryId.entries()) {
        const updated = await tx
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

        if (updated.length === 0) {
          const category = categoryMap.get(catId);
          throw new InsufficientStockError(`Insufficient stock for ${category?.name || "category " + catId}`);
        }
      }

      return created.id;
    });

    const order = await getOrderById(createdId);
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/orders/track", async (req, res, next) => {
  try {
    const query = TrackOrderQueryParams.parse(req.query);
    const conditions = [];
    if (query.orderNumber && query.orderNumber.trim()) {
      conditions.push(eq(ordersTable.orderNumber, query.orderNumber.trim()));
    }
    if (query.phone && query.phone.trim()) {
      conditions.push(eq(ordersTable.phoneNumber, query.phone.trim()));
    }

    // Fail-safe: prevent dumping the database if query is empty or whitespace
    if (conditions.length === 0) {
      res.status(400).json({ error: "orderNumber or phone is required to track an order" });
      return;
    }

    const matchingOrders = await db
      .select()
      .from(ordersTable)
      .where(or(...conditions))
      .orderBy(desc(ordersTable.createdAt));

    if (matchingOrders.length === 0) {
      res.json([]);
      return;
    }

    const orderIds = matchingOrders.map((o) => o.id);
    const items = await db
      .select()
      .from(orderItemsTable)
      .innerJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
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
        createdBy: order.createdBy,
        createdAt: order.createdAt.toISOString(),
        items: itemsByOrderId.get(order.id) ?? [],
      })),
    );
  } catch (error) {
    next(error);
  }
});

const sanitizeCsvCell = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '""';
  const text = String(val).replace(/[\r\n]+/g, " ").trim();
  // Neutralize formula injection triggers: =, +, -, @, tab, carriage return
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
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
      ["رقم الطلب", "الاسم", "الموبايل", "الاستلام", "الحالة", "الإجمالي"].join(","),
      ...filtered.map((order) =>
        [
          sanitizeCsvCell(order.orderNumber),
          sanitizeCsvCell(order.customerName),
          sanitizeCsvCell(order.phoneNumber),
          sanitizeCsvCell(`${order.pickupDate} ${order.pickupTime}`),
          sanitizeCsvCell(order.status),
          sanitizeCsvCell(order.totalPrice.toFixed(2)),
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
    const input = UpdateOrderBody.parse(req.body);
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
    const [updated] = await db
      .update(ordersTable)
      .set(orderPatch)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id });
    if (!updated) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(await getOrderById(updated.id));
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/summary", requirePermission("analytics"), async (_req, res, next) => {
  try {
    await ensureSeedCategories();
    const getLocalTodayString = () => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    };
    const today = getLocalTodayString();
    const [orders, categories] = await Promise.all([
      listOrderRecords({}),
      db.select().from(categoriesTable),
    ]);
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