import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
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

async function listClerkUsers() {
  const result = await clerkClient.users.getUserList({ limit: 100 });
  return result.data;
}

async function hasOwnerAccount() {
  const users = await listClerkUsers();
  return users.some(isOwner);
}

async function getAuthenticatedUser(req: Parameters<RequestHandler>[0]) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  return userId ? clerkClient.users.getUser(userId) : null;
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

router.get("/staff/users", requireOwner, async (_req, res, next) => {
  try {
    res.json((await listClerkUsers()).map(toStaffMember));
  } catch (error) {
    next(error);
  }
});

router.patch("/staff/users/:userId", requireOwner, async (req, res, next) => {
  try {
    const { userId } = UpdateStaffUserParams.parse(req.params);
    const input = UpdateStaffUserBody.parse(req.body);
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

  const rows = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ordersTable.createdAt));

  const orders = await Promise.all(
    rows.map(({ id }) => getOrderById(id)),
  );
  return orders.filter((order): order is NonNullable<typeof order> => order !== null);
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
    const query = ListOrdersQueryParams.parse(req.query);
    res.json(
      await listOrderRecords({
        ...query,
        date:
          query.date instanceof Date
            ? query.date.toISOString().slice(0, 10)
            : query.date,
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
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.isActive, true), inArray(categoriesTable.id, categoryIds)));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    if (categories.length !== new Set(categoryIds).size) {
      res.status(400).json({ error: "One or more selected categories are unavailable" });
      return;
    }

    const preparedItems = input.items.map((item) => {
      const category = categoryMap.get(item.categoryId)!;
      const subtotal = item.quantity * numberValue(category.pricePerUnit);
      return { ...item, subtotal };
    });
    const totalPrice = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);

    const createdId = await db.transaction(async (tx) => {
      const orderNumber = `EID-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
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
          createdBy: input.createdBy ?? "guest",
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
      return created.id;
    });

    const order = await getOrderById(createdId);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.get("/orders/track", async (req, res, next) => {
  try {
    const query = TrackOrderQueryParams.parse(req.query);
    const conditions = [];
    if (query.orderNumber) conditions.push(eq(ordersTable.orderNumber, query.orderNumber));
    if (query.phone) conditions.push(eq(ordersTable.phoneNumber, query.phone));
    const rows = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(conditions.length ? or(...conditions) : undefined)
      .orderBy(desc(ordersTable.createdAt));
    const orders = await Promise.all(rows.map(({ id }) => getOrderById(id)));
    res.json(orders.filter((order): order is NonNullable<typeof order> => order !== null));
  } catch (error) {
    next(error);
  }
});

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
          order.orderNumber,
          `"${order.customerName.replaceAll('"', '""')}"`,
          order.phoneNumber,
          `${order.pickupDate} ${order.pickupTime}`,
          order.status,
          order.totalPrice.toFixed(2),
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
    const today = new Date().toISOString().slice(0, 10);
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
    const eid = new Date("2027-03-09T00:00:00Z");
    const daysUntilEid = Math.max(
      0,
      Math.ceil((eid.getTime() - Date.now()) / 86_400_000),
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