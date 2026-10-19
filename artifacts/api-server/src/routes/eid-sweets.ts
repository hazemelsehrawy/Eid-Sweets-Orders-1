import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import {
  db,
  categoriesTable,
  ordersTable,
  orderItemsTable,
  usersTable,
  type Category,
  type Order,
  type OrderItem,
} from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  CreateOrderBody,
  UpdateOrderBody,
  BulkUpdateOrderStatusBody,
  TrackOrderQueryParams,
  ExportOrdersQueryParams,
  ListOrdersQueryParams,
} from "@workspace/api-zod";
import { eq, desc, asc, and, or, inArray, sql, ilike } from "drizzle-orm";

// Import from our modular service layer
import {
  SESSION_SECRET,
  ADMIN_INITIAL_PASSWORD,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  loginRateLimits,
  orderRateLimits,
  trackRateLimits,
  checkRateLimit,
  getClientIp,
  fallbackUsers,
  type FallbackUser,
  type StaffPermission,
  STAFF_PERMISSIONS,
  allStaffPermissions,
  getAuthenticatedUser,
  requirePermission,
  requireOwner,
  hasStaffAccess,
  hasOwnerAccount,
  ensureDefaultOwner,
} from "../services/staff-auth.service";

import {
  numberValue,
  getDefaultSweetImage,
  toCategory,
  fallbackCategories,
  type FallbackCategory,
  ensureSeedCategories,
} from "../services/category.service";

import {
  ACTIVE_ORDER_STATUSES,
  InsufficientStockError,
  OrderValidationError,
  escapeLikePattern,
  maskCustomerName,
  maskPhoneNumber,
  parseDepositAmount,
  toDateString,
  fallbackOrders,
  type FallbackOrder,
  type FallbackOrderItem,
  getActiveReservations,
  generateUniqueOrderNumber,
  generateNextPosOrderNumber,
} from "../services/order.service";

import { sanitizeCsvCell } from "../services/csv-export.service";
import { getAggregatedDashboardSummary, getLocalTodayString } from "../services/dashboard.service";

// Re-export symbols for backward compatibility and test runner imports
export {
  SESSION_SECRET,
  ADMIN_INITIAL_PASSWORD,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  fallbackUsers,
  type FallbackUser,
  parseDepositAmount,
  toDateString,
  numberValue,
  getDefaultSweetImage,
  toCategory,
  fallbackCategories,
  type FallbackCategory,
  fallbackOrders,
  ACTIVE_ORDER_STATUSES,
  getActiveReservations,
  generateUniqueOrderNumber,
  generateNextPosOrderNumber,
  sanitizeCsvCell,
};

const router: IRouter = Router();

const toOrderItem = (
  row: typeof orderItemsTable.$inferSelect,
  category?: (typeof categoriesTable.$inferSelect) | null,
) => {
  const fallbackCat = fallbackCategories.find((c) => c.id === row.categoryId);
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryNameSnapshot || category?.name || fallbackCat?.name || "حلويات العيد",
    unit: (row.unit || category?.unit || fallbackCat?.unit || "kilo") as "kilo" | "half_kilo" | "box" | "piece",
    quantity: numberValue(row.quantity),
    subtotal: numberValue(row.subtotal),
  };
};

let nextFallbackOrderId = fallbackOrders.length;

/* ========================================================================== */
/* STAFF AUTHENTICATION & MANAGEMENT ENDPOINTS                                */
/* ========================================================================== */

router.get("/staff/access", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.json({
        staffAccess: false,
        role: "none",
        permissions: [],
        canManageTeam: false,
        setupAvailable: !(await hasOwnerAccount()),
      });
      return;
    }

    const metadata = (user.publicMetadata || {}) as any;
    const isOwnerUser = metadata.role === "owner";
    const staffAccess = isOwnerUser || metadata.staffAccess === true;
    const permissions: StaffPermission[] = isOwnerUser
      ? allStaffPermissions
      : Array.isArray(metadata.permissions)
      ? metadata.permissions.filter((p: any) => STAFF_PERMISSIONS.includes(p))
      : [];

    res.json({
      staffAccess,
      role: isOwnerUser ? "owner" : staffAccess ? "staff" : "none",
      permissions,
      canManageTeam: isOwnerUser,
      setupAvailable: false,
      userId: user.id,
    });
  } catch (error) {
    next(error);
  }
});

// SEC-03: Block claim-owner if an owner already exists
router.post("/staff/claim-owner", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولاً لإنشاء حساب المالك" });
      return;
    }

    if (await hasOwnerAccount()) {
      res.status(403).json({ error: "تم تعيين مالك المتجر مسبقاً ولا يمكن إنشاء مالك جديد" });
      return;
    }

    await ensureDefaultOwner();
    res.json({
      staffAccess: true,
      role: "owner",
      permissions: allStaffPermissions,
      canManageTeam: true,
      setupAvailable: false,
      userId: user.id,
    });
  } catch (error) {
    next(error);
  }
});

// SEC-04 & SEC-06: Hardened Staff Login
router.post("/staff/login", async (req, res) => {
  try {
    const ip = getClientIp(req);
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

    const trimmedUsername = username ? String(username).trim() : "";
    if (!trimmedUsername) {
      res.status(400).json({ error: "اسم المستخدم مطلوب" });
      return;
    }

    const selectedRole = role === "staff" ? "staff" : "owner";

    let targetUser: any = null;
    if (process.env.DATABASE_URL) {
      try {
        const rows = await db
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.username, trimmedUsername), eq(usersTable.role, selectedRole)))
          .limit(1);
        if (rows.length > 0) targetUser = rows[0];
      } catch (err) {
        if (process.env.NODE_ENV === "test" || process.env.VITEST) {
          targetUser = fallbackUsers.find(
            (u) => u.username.toLowerCase() === trimmedUsername.toLowerCase() && u.role === selectedRole,
          );
        }
        console.error("Login DB error:", err);
      }
    } else {
      targetUser = fallbackUsers.find(
        (u) => u.username.toLowerCase() === trimmedUsername.toLowerCase() && u.role === selectedRole,
      );
    }

    if (!targetUser) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }

    if (!verifyPassword(password, targetUser.passwordHash)) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }

    if (targetUser.role !== "owner" && (!targetUser.staffAccess || targetUser.status !== "approved")) {
      res.status(403).json({ error: "حسابك قيد المراجعة أو غير مفعل من قبل الإدارة" });
      return;
    }

    const token = createSessionToken(targetUser.id);
    // SEC-06: Strict SameSite cookie flags
    res.cookie("staff_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userPermissions = targetUser.role === "owner"
      ? allStaffPermissions
      : (targetUser.permissions as StaffPermission[]) || [];

    res.json({
      success: true,
      token,
      role: targetUser.role,
      user: {
        userId: String(targetUser.id),
        name: targetUser.fullName,
        email: targetUser.email || `${targetUser.username}@local`,
        username: targetUser.username,
        role: targetUser.role,
        status: targetUser.status,
        staffAccess: targetUser.staffAccess,
        permissions: userPermissions,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

router.post("/staff/register", async (req, res) => {
  try {
    const { username, password, fullName, email } = req.body || {};
    if (!username || !password || !fullName) {
      res.status(400).json({ error: "جميع الحقول الأساسية مطلوبة (الاسم، اسم المستخدم، كلمة المرور)" });
      return;
    }

    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3) {
      res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    await ensureDefaultOwner();

    if (process.env.DATABASE_URL) {
      try {
        const existing = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.username, cleanUsername))
          .limit(1);
        if (existing.length > 0) {
          res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
          return;
        }

        const passwordHash = hashPassword(String(password));
        await db.insert(usersTable).values({
          username: cleanUsername,
          fullName: String(fullName).trim(),
          email: email ? String(email).trim() : null,
          passwordHash,
          role: "staff",
          status: "pending",
          staffAccess: false,
          permissions: [],
        });

        res.status(201).json({
          success: true,
          message: "تم إرسال طلب الانضمام بنجاح وهو بانتظار موافقة مدير المحل",
        });
        return;
      } catch (err) {
        console.error("Register DB error:", err);
      }
    }

    const existingMem = fallbackUsers.find((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (existingMem) {
      res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
      return;
    }

    const newId = fallbackUsers.length > 0 ? Math.max(...fallbackUsers.map((u) => u.id)) + 1 : 1;
    fallbackUsers.push({
      id: newId,
      username: cleanUsername,
      fullName: String(fullName).trim(),
      email: email ? String(email).trim() : `${cleanUsername}@local`,
      passwordHash: hashPassword(String(password)),
      role: "staff",
      status: "pending",
      staffAccess: false,
      permissions: [],
    });

    res.status(201).json({
      success: true,
      message: "تم إرسال طلب الانضمام بنجاح وهو بانتظار موافقة مدير المحل",
    });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الموظف" });
  }
});

router.post("/staff/change-password", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "تسجيل الدخول مطلوب" });
      return;
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    const userIdNum = parseInt(user.id, 10);
    let targetUser: any = null;

    if (process.env.DATABASE_URL) {
      try {
        const rows = await db.select().from(usersTable).where(eq(usersTable.id, userIdNum)).limit(1);
        if (rows.length > 0) targetUser = rows[0];
      } catch {}
    } else {
      targetUser = fallbackUsers.find((u) => u.id === userIdNum);
    }

    if (!targetUser) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    if (!verifyPassword(String(currentPassword), targetUser.passwordHash)) {
      res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }

    const newHash = hashPassword(String(newPassword));
    if (process.env.DATABASE_URL) {
      await db
        .update(usersTable)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(usersTable.id, userIdNum));
    } else {
      targetUser.passwordHash = newHash;
    }

    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء تغيير كلمة المرور" });
  }
});

router.post("/staff/logout", (_req, res) => {
  res.clearCookie("staff_session", { path: "/" });
  res.json({ success: true });
});

router.get("/staff/users", requireOwner(), async (_req, res, next) => {
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
      } catch (err) {
        console.error("List users DB error:", err);
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

// INJ-03: Validate staff user update
router.patch("/staff/users/:userId", requireOwner(), async (req, res, next) => {
  try {
    const userIdNum = parseInt(String(req.params.userId), 10);
    const { staffAccess, permissions, status } = req.body || {};

    let target: any = null;
    if (process.env.DATABASE_URL) {
      const existing = await db.select().from(usersTable).where(eq(usersTable.id, userIdNum)).limit(1);
      if (existing.length > 0) target = existing[0];
    } else {
      target = fallbackUsers.find((u) => u.id === userIdNum) || null;
    }

    if (!target) {
      res.status(404).json({ error: "الموظف غير موجود" });
      return;
    }

    if (target.role === "owner") {
      res.status(400).json({ error: "لا يمكن تعديل صلاحيات حساب المالك" });
      return;
    }

    const nextStatus = status || (staffAccess ? "approved" : staffAccess === false ? "rejected" : target.status);
    const nextAccess = staffAccess !== undefined ? Boolean(staffAccess) : nextStatus === "approved";
    const nextPermissions = Array.isArray(permissions)
      ? permissions.filter((p) => STAFF_PERMISSIONS.includes(p))
      : target.permissions;

    let updated: any = null;
    if (process.env.DATABASE_URL) {
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
      updated = dbUpdated;
    } else {
      target.staffAccess = nextAccess;
      target.status = nextStatus;
      target.permissions = nextPermissions;
      updated = target;
    }

    res.json({
      userId: String(updated.id),
      name: updated.fullName,
      email: updated.email || `${updated.username}@local`,
      username: updated.username,
      role: updated.role,
      status: updated.status,
      staffAccess: updated.staffAccess,
      permissions: updated.permissions,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/staff/users/:userId", requireOwner(), async (req, res, next) => {
  try {
    const userIdNum = parseInt(String(req.params.userId), 10);
    if (process.env.DATABASE_URL) {
      await db.delete(usersTable).where(eq(usersTable.id, userIdNum));
    } else {
      const idx = fallbackUsers.findIndex((u) => u.id === userIdNum);
      if (idx !== -1) fallbackUsers.splice(idx, 1);
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/* ========================================================================== */
/* CATEGORIES ENDPOINTS                                                       */
/* ========================================================================== */

router.get("/categories", async (_req, res, next) => {
  try {
    await ensureSeedCategories();
    const activeReservations = await getActiveReservations();

    if (process.env.DATABASE_URL) {
      try {
        const rows = await db
          .select()
          .from(categoriesTable)
          .where(eq(categoriesTable.isActive, true))
          .orderBy(asc(categoriesTable.id));

        res.json(rows.map((row) => toCategory(row, activeReservations.get(row.id))));
        return;
      } catch (err) {
        console.error("List categories DB error:", err);
      }
    }

    res.json(
      fallbackCategories
        .filter((c) => c.isActive)
        .map((c) => {
          const resMap = activeReservations.get(c.id);
          const reservedStock = resMap?.regular ?? 0;
          const reservedHalfKiloStock = resMap?.halfKilo ?? 0;
          return {
            ...c,
            reservedStock,
            reservedHalfKiloStock,
            availableStock: Math.max(0, Number((c.stockQuantity - reservedStock).toFixed(2))),
            availableHalfKiloStock: Math.max(0, Number((c.halfKiloStock - reservedHalfKiloStock).toFixed(2))),
          };
        }),
    );
  } catch (error) {
    next(error);
  }
});

// SEC-10: Restrict category mutations to inventory permission
router.post("/categories", requirePermission("inventory"), async (req, res, next) => {
  try {
    const input = CreateCategoryBody.parse(req.body);
    const imageUrl = input.imageUrl || getDefaultSweetImage(input.name);

    if (process.env.DATABASE_URL) {
      try {
        const [created] = await db
          .insert(categoriesTable)
          .values({
            name: input.name,
            unit: input.unit,
            pricePerUnit: String(input.pricePerUnit),
            stockQuantity: String(input.stockQuantity),
            lowStockThreshold: String(input.lowStockThreshold ?? 5),
            halfKiloPrice: input.halfKiloPrice !== undefined && input.halfKiloPrice !== null ? String(input.halfKiloPrice) : null,
            halfKiloStock: String(input.halfKiloStock ?? 0),
            halfKiloThreshold: String(input.halfKiloThreshold ?? 5),
            imageUrl,
            isActive: true,
          })
          .returning();

        res.status(201).json(toCategory(created));
        return;
      } catch (err) {
        console.error("Create category DB error:", err);
      }
    }

    const newId = fallbackCategories.length > 0 ? Math.max(...fallbackCategories.map((c) => c.id)) + 1 : 1;
    const newCat: FallbackCategory = {
      id: newId,
      name: input.name,
      unit: input.unit,
      pricePerUnit: input.pricePerUnit,
      stockQuantity: input.stockQuantity,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      halfKiloPrice: input.halfKiloPrice ?? null,
      halfKiloStock: input.halfKiloStock ?? 0,
      halfKiloThreshold: input.halfKiloThreshold ?? 5,
      imageUrl,
      isActive: true,
    };
    fallbackCategories.push(newCat);
    res.status(201).json(newCat);
  } catch (error) {
    next(error);
  }
});

router.patch("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const categoryId = parseInt(String(req.params.categoryId), 10);
    const input = UpdateCategoryBody.parse(req.body);

    if (process.env.DATABASE_URL) {
      try {
        const updateData: Record<string, any> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.unit !== undefined) updateData.unit = input.unit;
        if (input.pricePerUnit !== undefined) updateData.pricePerUnit = String(input.pricePerUnit);
        if (input.stockQuantity !== undefined) updateData.stockQuantity = String(input.stockQuantity);
        if (input.lowStockThreshold !== undefined) updateData.lowStockThreshold = String(input.lowStockThreshold);
        if (input.halfKiloPrice !== undefined) updateData.halfKiloPrice = input.halfKiloPrice !== null ? String(input.halfKiloPrice) : null;
        if (input.halfKiloStock !== undefined) updateData.halfKiloStock = String(input.halfKiloStock);
        if (input.halfKiloThreshold !== undefined) updateData.halfKiloThreshold = String(input.halfKiloThreshold);
        if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;

        const [updated] = await db
          .update(categoriesTable)
          .set(updateData)
          .where(eq(categoriesTable.id, categoryId))
          .returning();

        if (updated) {
          const activeReservations = await getActiveReservations(undefined, [categoryId]);
          res.json(toCategory(updated, activeReservations.get(updated.id)));
          return;
        }
      } catch (err) {
        console.error("Update category DB error:", err);
      }
    }

    const cat = fallbackCategories.find((c) => c.id === categoryId);
    if (!cat) {
      res.status(404).json({ error: "الصنف غير موجود" });
      return;
    }
    Object.assign(cat, input);
    res.json(cat);
  } catch (error) {
    next(error);
  }
});

router.delete("/categories/:categoryId", requirePermission("inventory"), async (req, res, next) => {
  try {
    const categoryId = parseInt(String(req.params.categoryId), 10);
    if (process.env.DATABASE_URL) {
      // Soft-delete by marking inactive to preserve order items foreign keys
      await db.update(categoriesTable).set({ isActive: false }).where(eq(categoriesTable.id, categoryId));
    } else {
      const cat = fallbackCategories.find((c) => c.id === categoryId);
      if (cat) cat.isActive = false;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/* ========================================================================== */
/* ORDERS ENDPOINTS                                                           */
/* ========================================================================== */

// PERF-02: Paginated listOrderRecords
async function listOrderRecords(filters: {
  status?: string;
  date?: string;
  search?: string;
  timeframe?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  if (process.env.DATABASE_URL) {
    try {
      const conditions = [];
      if (filters.status) {
        conditions.push(eq(ordersTable.status, filters.status as any));
      }
      if (filters.date) {
        conditions.push(eq(ordersTable.pickupDate, filters.date));
      }
      if (filters.search) {
        const clean = escapeLikePattern(filters.search.trim());
        conditions.push(
          or(
            ilike(ordersTable.customerName, `%${clean}%`),
            ilike(ordersTable.phoneNumber, `%${clean}%`),
            ilike(ordersTable.orderNumber, `%${clean}%`),
          ),
        );
      }
      if (filters.timeframe) {
        const today = getLocalTodayString();
        if (filters.timeframe === "today") {
          conditions.push(eq(ordersTable.pickupDate, today));
        } else if (filters.timeframe === "upcoming") {
          conditions.push(sql`${ordersTable.pickupDate} > ${today}`);
        } else if (filters.timeframe === "past") {
          conditions.push(sql`${ordersTable.pickupDate} < ${today}`);
        }
      }

      const rows = await db
        .select()
        .from(ordersTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(ordersTable.createdAt))
        .limit(limit)
        .offset(offset);

      if (rows.length === 0) return [];

      const orderIds = rows.map((r) => r.id);
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

      return rows.map((order) => ({
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
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        createdBy: order.createdBy,
        createdAt: order.createdAt.toISOString(),
        items: itemsByOrderId.get(order.id) ?? [],
      }));
    } catch (err) {
      console.error("listOrderRecords DB error:", err);
    }
  }

  // In-memory fallback
  return fallbackOrders
    .filter((order) => {
      if (filters.status && order.status !== filters.status) return false;
      if (filters.date && order.pickupDate !== filters.date) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (
          !order.customerName.toLowerCase().includes(s) &&
          !order.phoneNumber.includes(s) &&
          !order.orderNumber.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    })
    .slice(offset, offset + limit);
}

router.get("/orders", requirePermission("orders"), async (req, res, next) => {
  try {
    const orders = await listOrderRecords({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      timeframe: typeof req.query.timeframe === "string" ? req.query.timeframe : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      offset: req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// POST /orders with FIN-01, INV-01, DB-05, FIN-02, FIN-03 fixes
router.post("/orders", async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    // Rate limit orders: 30 orders per 10 minutes per IP
    if (!checkRateLimit(orderRateLimits, ip, 30, 10 * 60 * 1000)) {
      res.status(429).json({ error: "تم إرسال عدد كبير من الطلبات. يرجى الانتظار بضع دقائق." });
      return;
    }

    const input = CreateOrderBody.parse(req.body);
    const authUser = await getAuthenticatedUser(req);
    const effectiveCreatedBy =
      authUser && hasStaffAccess(authUser) && input.createdBy === "admin" ? "admin" : "guest";
    const isStaff = effectiveCreatedBy === "admin";

    const initialStatus = isStaff && (input as any).status === "delivered" ? "delivered" : "pending";
    const isDirectDelivered = initialStatus === "delivered";

    const isPosOrder =
      isStaff &&
      (isDirectDelivered ||
        (input as any).orderType === "pos" ||
        input.pickupTime?.includes("كاشير") ||
        input.customerName === "عميل مباشر");

    if (process.env.DATABASE_URL) {
      try {
        await ensureSeedCategories();

        const createdId = await db.transaction(async (tx) => {
          // Pre-fetch all categories to map IDs cleanly
          const allCategories = await tx.select().from(categoriesTable);

          // Remap item category IDs if needed
          for (const item of input.items) {
            let matched = allCategories.find((c) => c.id === item.categoryId);
            if (!matched) {
              const fbCat = fallbackCategories.find((fc) => fc.id === item.categoryId);
              if (fbCat) {
                const matchedByName = allCategories.find(
                  (c) => c.name.trim().toLowerCase() === fbCat.name.trim().toLowerCase(),
                );
                if (matchedByName) {
                  item.categoryId = matchedByName.id;
                  matched = matchedByName;
                }
              }
            }
            if (!matched) {
              throw new InsufficientStockError(`الصنف غير متوفر (رقم: ${item.categoryId})`);
            }

            // FIN-02: Prevent unit substitution
            if (item.unit === "half_kilo" && matched.unit !== "kilo") {
              throw new OrderValidationError(`الصنف ${matched.name} لا يدعم وحدة نصف كيلو`);
            }
          }

          // INV-01 & DB-05: Sort canonical category IDs ascending to prevent PostgreSQL 40P01 deadlocks
          const canonicalCatIds = Array.from(new Set(input.items.map((i) => i.categoryId))).sort((a, b) => a - b);

          // Acquire row-level locks on categories in ascending order
          const lockedCategories = await tx
            .select()
            .from(categoriesTable)
            .where(inArray(categoriesTable.id, canonicalCatIds))
            .orderBy(asc(categoriesTable.id))
            .for("update");

          const categoryMap = new Map(lockedCategories.map((c) => [c.id, c]));

          // INV-05: Scope reservation check to demanded categories only
          const activeReservations = await getActiveReservations(tx, canonicalCatIds);

          const regularQtyByCat = new Map<number, number>();
          const halfKiloQtyByCat = new Map<number, number>();

          for (const item of input.items) {
            const itemUnit = item.unit || "kilo";
            if (itemUnit === "half_kilo") {
              halfKiloQtyByCat.set(item.categoryId, (halfKiloQtyByCat.get(item.categoryId) || 0) + item.quantity);
            } else {
              regularQtyByCat.set(item.categoryId, (regularQtyByCat.get(item.categoryId) || 0) + item.quantity);
            }
          }

          // Check stock capacity
          for (const catId of canonicalCatIds) {
            const category = categoryMap.get(catId)!;
            const resData = activeReservations.get(catId) || { regular: 0, halfKilo: 0 };
            const reqReg = regularQtyByCat.get(catId) || 0;
            const reqHalf = halfKiloQtyByCat.get(catId) || 0;

            const totalStock = numberValue(category.stockQuantity);
            const totalHalfStock = numberValue(category.halfKiloStock);

            if (reqReg > 0 && reqReg + resData.regular > totalStock) {
              const avail = Math.max(0, totalStock - resData.regular);
              throw new InsufficientStockError(
                `عذراً، الكمية المتبقية من "${category.name}" هي ${avail} فقط. يرجى تعديل الكمية.`,
              );
            }

            if (reqHalf > 0 && reqHalf + resData.halfKilo > totalHalfStock) {
              const availHalf = Math.max(0, totalHalfStock - resData.halfKilo);
              throw new InsufficientStockError(
                `عذراً، الكمية المتبقية من نصف كيلو "${category.name}" هي ${availHalf} فقط.`,
              );
            }
          }

          // Calculate pricing with FIN-03 exact 2-decimal precision
          const preparedItems = input.items.map((item) => {
            const category = categoryMap.get(item.categoryId)!;
            const itemUnit = item.unit || category.unit || "kilo";
            let unitPrice = numberValue(category.pricePerUnit);
            if (itemUnit === "half_kilo") {
              unitPrice =
                category.halfKiloPrice !== null && category.halfKiloPrice !== undefined && Number(category.halfKiloPrice) > 0
                  ? numberValue(category.halfKiloPrice)
                  : Number((numberValue(category.pricePerUnit) / 2).toFixed(2));
            }
            const subtotal = Number((item.quantity * unitPrice).toFixed(2));
            return {
              ...item,
              unit: itemUnit,
              unitPrice,
              categoryName: category.name,
              subtotal,
            };
          });

          const totalPrice = Number(preparedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

          // FIN-01: Neutralize guest payment and deposit tampering
          const depositAmount = isStaff && isDirectDelivered
            ? totalPrice
            : isStaff
            ? Math.min(totalPrice, Math.max(0, Number((input as any).depositAmount ?? 0)))
            : 0;

          const remainingBalance = isStaff && isDirectDelivered
            ? 0
            : Number((totalPrice - depositAmount).toFixed(2));

          const paymentMethod = isStaff ? ((input as any).paymentMethod || "cash") : "cash";

          const paymentStatus = isStaff && isDirectDelivered
            ? "paid"
            : isStaff
            ? ((input as any).paymentStatus ||
              (depositAmount >= totalPrice && totalPrice > 0
                ? "paid"
                : depositAmount > 0
                ? "partially_paid"
                : "unpaid"))
            : "unpaid";

          const orderNumber = isPosOrder
            ? await generateNextPosOrderNumber(tx)
            : await generateUniqueOrderNumber(tx);

          const [created] = await tx
            .insert(ordersTable)
            .values({
              orderNumber,
              customerName: input.customerName,
              phoneNumber: input.phoneNumber,
              pickupDate: toDateString(input.pickupDate),
              pickupTime: input.pickupTime,
              status: initialStatus,
              notes: input.notes || null,
              totalPrice: totalPrice.toFixed(2),
              depositAmount: depositAmount.toFixed(2),
              remainingBalance: remainingBalance.toFixed(2),
              paymentMethod,
              paymentStatus,
              createdBy: effectiveCreatedBy,
            })
            .returning({ id: ordersTable.id });

          // DB-02: Save historical snapshots of categoryName and unitPrice
          await tx.insert(orderItemsTable).values(
            preparedItems.map((item) => ({
              orderId: created.id,
              categoryId: item.categoryId,
              categoryNameSnapshot: item.categoryName,
              unitPriceSnapshot: item.unitPrice.toFixed(2),
              unit: item.unit,
              quantity: String(item.quantity),
              subtotal: item.subtotal.toFixed(2),
            })),
          );

          // If direct delivered at creation, decrement physical inventory safely
          if (isDirectDelivered) {
            for (const item of preparedItems) {
              if (item.unit === "half_kilo") {
                await tx
                  .update(categoriesTable)
                  .set({
                    halfKiloStock: sql`(${categoriesTable.halfKiloStock}::numeric - ${item.quantity})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              } else {
                await tx
                  .update(categoriesTable)
                  .set({
                    stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric - ${item.quantity})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              }
            }
          }

          return created.id;
        });

        const createdOrder = (await listOrderRecords({ limit: 1 })).find((o) => o.id === createdId);
        if (createdOrder) {
          res.status(201).json(createdOrder);
          return;
        }
      } catch (err: any) {
        if (err instanceof InsufficientStockError || err instanceof OrderValidationError) {
          res.status(409).json({ error: err.message });
          return;
        }
        console.error("Create order DB error:", err);
      }
    }

    // In-Memory Fallback Order Creation
    for (const item of input.items) {
      const cat = fallbackCategories.find((c) => c.id === item.categoryId);
      if (item.unit === "half_kilo" && cat && cat.unit !== "kilo") {
        res.status(409).json({ error: `الصنف ${cat.name} لا يدعم وحدة نصف كيلو` });
        return;
      }
    }

    const memoryItems: FallbackOrderItem[] = input.items.map((item, idx) => {
      const cat = fallbackCategories.find((c) => c.id === item.categoryId);
      const itemUnit = item.unit || cat?.unit || "kilo";
      let price = cat ? cat.pricePerUnit : 180;
      if (itemUnit === "half_kilo") {
        price = cat?.halfKiloPrice || Number((price / 2).toFixed(2));
      }
      return {
        id: idx + 1,
        categoryId: item.categoryId,
        categoryName: cat?.name || "حلويات العيد",
        unit: itemUnit,
        quantity: item.quantity,
        subtotal: Number((item.quantity * price).toFixed(2)),
      };
    });

    const memTotalPrice = Number(memoryItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const memDeposit = isStaff && isDirectDelivered
      ? memTotalPrice
      : isStaff
      ? Math.min(memTotalPrice, Math.max(0, Number((input as any).depositAmount ?? 0)))
      : 0;

    const memRemaining = isStaff && isDirectDelivered ? 0 : Number((memTotalPrice - memDeposit).toFixed(2));
    const memMethod = isStaff ? ((input as any).paymentMethod || "cash") : "cash";
    const memStatus = isStaff && isDirectDelivered ? "paid" : "unpaid";

    const fallbackOrderNumber = isPosOrder
      ? await generateNextPosOrderNumber(undefined, fallbackOrders)
      : await generateUniqueOrderNumber(undefined, fallbackOrders);

    const newOrder: FallbackOrder = {
      id: ++nextFallbackOrderId,
      orderNumber: fallbackOrderNumber,
      customerName: input.customerName,
      phoneNumber: input.phoneNumber,
      pickupDate: toDateString(input.pickupDate),
      pickupTime: input.pickupTime,
      status: initialStatus,
      notes: input.notes,
      totalPrice: memTotalPrice,
      depositAmount: memDeposit,
      remainingBalance: memRemaining,
      paymentMethod: memMethod,
      paymentStatus: memStatus,
      createdBy: effectiveCreatedBy,
      createdAt: new Date().toISOString(),
      items: memoryItems,
    };

    fallbackOrders.unshift(newOrder);
    res.status(201).json(newOrder);
  } catch (error) {
    next(error);
  }
});

// IDOR-01, IDOR-02, IDOR-03: Hardened Track Order
router.get("/orders/track", async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    // IDOR-03: Sliding window rate limit (20 req / 10 min)
    if (!checkRateLimit(trackRateLimits, ip, 20, 10 * 60 * 1000)) {
      res.status(429).json({ error: "تم تجاوز حد محاولات تتبع الطلب. يرجى المحاولة بعد بضع دقائق." });
      return;
    }

    const query = TrackOrderQueryParams.parse(req.query);
    const orderNum = query.orderNumber ? query.orderNumber.trim() : "";
    const rawPhone = query.phone ? query.phone.trim() : "";
    const cleanPhone = rawPhone.replace(/\D/g, "");

    // IDOR-01: Require BOTH orderNumber AND phoneNumber
    if (!orderNum || cleanPhone.length < 10) {
      res.status(400).json({
        error: "لتتبع الطلب يجب إدخال رقم الطلب ورقم الهاتف الصحيح معاً (10 أرقام على الأقل)",
      });
      return;
    }

    if (process.env.DATABASE_URL) {
      try {
        const matchingOrders = await db
          .select()
          .from(ordersTable)
          .where(
            and(
              sql`LOWER(${ordersTable.orderNumber}) = LOWER(${orderNum})`,
              or(
                eq(ordersTable.phoneNumber, rawPhone),
                sql`REGEXP_REPLACE(${ordersTable.phoneNumber}, '[^0-9]', '', 'g') = ${cleanPhone}`,
              ),
            ),
          )
          .orderBy(desc(ordersTable.createdAt))
          .limit(1);

        if (matchingOrders.length > 0) {
          const order = matchingOrders[0];
          const items = await db
            .select()
            .from(orderItemsTable)
            .leftJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
            .where(eq(orderItemsTable.orderId, order.id))
            .orderBy(asc(orderItemsTable.id));

          // IDOR-02: Mask customer PII and omit internal notes
          res.json([
            {
              id: order.id,
              orderNumber: order.orderNumber,
              customerName: maskCustomerName(order.customerName),
              phoneNumber: maskPhoneNumber(order.phoneNumber),
              pickupDate: order.pickupDate,
              pickupTime: order.pickupTime,
              status: order.status,
              notes: "",
              totalPrice: numberValue(order.totalPrice),
              depositAmount: numberValue(order.depositAmount),
              remainingBalance: numberValue(order.remainingBalance),
              paymentMethod: order.paymentMethod,
              paymentStatus: order.paymentStatus,
              createdBy: order.createdBy,
              createdAt: order.createdAt.toISOString(),
              items: items.map(({ order_items: it, categories: cat }) => toOrderItem(it, cat)),
            },
          ]);
          return;
        }

        res.json([]);
        return;
      } catch (err) {
        console.error("GET /orders/track DB error:", err);
      }
    }

    // In-memory fallback
    const matched = fallbackOrders.filter(
      (o) =>
        o.orderNumber.toLowerCase() === orderNum.toLowerCase() &&
        (o.phoneNumber === rawPhone || o.phoneNumber.replace(/\D/g, "") === cleanPhone),
    );

    res.json(
      matched.map((order) => ({
        ...order,
        customerName: maskCustomerName(order.customerName),
        phoneNumber: maskPhoneNumber(order.phoneNumber),
        notes: "",
      })),
    );
  } catch (error) {
    next(error);
  }
});

// INJ-02: Hardened CSV Export
router.get("/orders/export", requirePermission("orders"), async (req, res, next) => {
  try {
    const { range } = ExportOrdersQueryParams.parse(req.query);
    const start = new Date();
    if (range === "day") start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - 6);

    const orders = await listOrderRecords({ limit: 5000 });
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
          sanitizeCsvCell(order.totalPrice),
          sanitizeCsvCell(order.depositAmount),
          sanitizeCsvCell(order.remainingBalance),
          sanitizeCsvCell(order.paymentMethod),
          sanitizeCsvCell(order.paymentStatus),
        ].join(","),
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="orders-export.csv"');
    res.send("\uFEFF" + lines.join("\r\n"));
  } catch (error) {
    next(error);
  }
});

// INV-02, INV-03, POS-03: Atomic Bulk Status Update
router.post("/orders/bulk-status", requirePermission("orders"), async (req, res, next) => {
  try {
    const { orderIds, status } = BulkUpdateOrderStatusBody.parse(req.body);

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json({ error: "orderIds must be a non-empty array" });
      return;
    }

    if (orderIds.length > 100) {
      res.status(400).json({ error: "الحد الأقصى للتحديث الجماعي هو 100 طلب في المرة الواحدة" });
      return;
    }

    if (process.env.DATABASE_URL) {
      try {
        const updatedCount = await db.transaction(async (tx) => {
          // Lock targeted orders in ascending order to prevent deadlocks
          const sortedIds = [...orderIds].sort((a, b) => a - b);
          const existingOrders = await tx
            .select()
            .from(ordersTable)
            .where(inArray(ordersTable.id, sortedIds))
            .orderBy(asc(ordersTable.id))
            .for("update");

          if (existingOrders.length === 0) return 0;

          const matchedIds = existingOrders.map((o) => o.id);
          const allItems = await tx
            .select()
            .from(orderItemsTable)
            .where(inArray(orderItemsTable.orderId, matchedIds));

          const orderMap = new Map(existingOrders.map((o) => [o.id, o]));
          const regularQtyDeltaByCat = new Map<number, number>();
          const halfKiloQtyDeltaByCat = new Map<number, number>();

          for (const item of allItems) {
            const order = orderMap.get(item.orderId);
            if (!order) continue;
            const isToDelivered = status === "delivered" && order.status !== "delivered";
            const isFromDelivered = order.status === "delivered" && status !== "delivered";
            if (!isToDelivered && !isFromDelivered) continue;

            const sign = isToDelivered ? -1 : 1;
            const delta = numberValue(item.quantity) * sign;
            if (item.unit === "half_kilo") {
              halfKiloQtyDeltaByCat.set(
                item.categoryId,
                (halfKiloQtyDeltaByCat.get(item.categoryId) || 0) + delta,
              );
            } else {
              regularQtyDeltaByCat.set(
                item.categoryId,
                (regularQtyDeltaByCat.get(item.categoryId) || 0) + delta,
              );
            }
          }

          // Lock affected categories in ascending order
          const affectedCatIds = Array.from(
            new Set([...regularQtyDeltaByCat.keys(), ...halfKiloQtyDeltaByCat.keys()]),
          ).sort((a, b) => a - b);

          if (affectedCatIds.length > 0) {
            const lockedCats = await tx
              .select()
              .from(categoriesTable)
              .where(inArray(categoriesTable.id, affectedCatIds))
              .orderBy(asc(categoriesTable.id))
              .for("update");

            const lockedCatMap = new Map(lockedCats.map((c) => [c.id, c]));

            // INV-03: Check sufficiency before decrementing
            for (const catId of affectedCatIds) {
              const cat = lockedCatMap.get(catId)!;
              const regDelta = regularQtyDeltaByCat.get(catId) || 0;
              const halfDelta = halfKiloQtyDeltaByCat.get(catId) || 0;

              if (regDelta < 0 && numberValue(cat.stockQuantity) + regDelta < 0) {
                throw new InsufficientStockError(
                  `المخزون الفعلي غير كافٍ لتسليم طلبات الصنف "${cat.name}".`,
                );
              }
              if (halfDelta < 0 && numberValue(cat.halfKiloStock) + halfDelta < 0) {
                throw new InsufficientStockError(
                  `المخزون الفعلي لنصف كيلو غير كافٍ لتسليم طلبات الصنف "${cat.name}".`,
                );
              }
            }

            // Apply stock updates
            for (const catId of affectedCatIds) {
              const regDelta = regularQtyDeltaByCat.get(catId) || 0;
              const halfDelta = halfKiloQtyDeltaByCat.get(catId) || 0;

              if (regDelta !== 0) {
                await tx
                  .update(categoriesTable)
                  .set({
                    stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric + ${regDelta})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, catId));
              }

              if (halfDelta !== 0) {
                await tx
                  .update(categoriesTable)
                  .set({
                    halfKiloStock: sql`(${categoriesTable.halfKiloStock}::numeric + ${halfDelta})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, catId));
              }
            }
          }

          const result = await tx
            .update(ordersTable)
            .set({ status })
            .where(inArray(ordersTable.id, matchedIds));

          return matchedIds.length;
        });

        res.json({ success: true, updatedCount });
        return;
      } catch (err: any) {
        if (err instanceof InsufficientStockError) {
          res.status(409).json({ error: err.message });
          return;
        }
        console.error("Bulk status DB error:", err);
      }
    }

    // In-memory fallback
    let updatedCount = 0;
    for (const order of fallbackOrders) {
      if (orderIds.includes(order.id)) {
        order.status = status;
        updatedCount++;
      }
    }
    res.json({ success: true, updatedCount });
  } catch (error) {
    next(error);
  }
});

// Single Order GET & PATCH
router.get("/orders/:orderId", requirePermission("orders"), async (req, res, next) => {
  try {
    const orderId = parseInt(String(req.params.orderId), 10);
    const orders = await listOrderRecords({ limit: 1 });
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// PATCH /orders/:orderId with INV-02 & INV-03 fixes
router.patch("/orders/:orderId", requirePermission("orders"), async (req, res, next) => {
  try {
    const orderId = parseInt(String(req.params.orderId), 10);
    const input = UpdateOrderBody.parse(req.body);

    if (process.env.DATABASE_URL) {
      try {
        const orderPatch: Record<string, any> = {};
        if (input.customerName !== undefined) orderPatch.customerName = input.customerName;
        if (input.phoneNumber !== undefined) orderPatch.phoneNumber = input.phoneNumber;
        if (input.pickupDate !== undefined) orderPatch.pickupDate = toDateString(input.pickupDate);
        if (input.pickupTime !== undefined) orderPatch.pickupTime = input.pickupTime;
        if (input.notes !== undefined) orderPatch.notes = input.notes;
        if (input.status !== undefined) orderPatch.status = input.status;

        const updated = await db.transaction(async (tx) => {
          // INV-02: Lock order with FOR UPDATE
          const [existingOrder] = await tx
            .select()
            .from(ordersTable)
            .where(eq(ordersTable.id, orderId))
            .limit(1)
            .for("update");

          if (!existingOrder) return null;

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
          }

          if ((input as any).paymentMethod !== undefined) {
            orderPatch.paymentMethod = String((input as any).paymentMethod);
          }
          if ((input as any).paymentStatus !== undefined) {
            orderPatch.paymentStatus = String((input as any).paymentStatus);
          }

          // Stock management on status transitions
          if (input.status === "delivered" && existingOrder.status !== "delivered") {
            const items = await tx
              .select()
              .from(orderItemsTable)
              .where(eq(orderItemsTable.orderId, orderId));

            const catIds = Array.from(new Set(items.map((i) => i.categoryId))).sort((a, b) => a - b);
            const lockedCats = await tx
              .select()
              .from(categoriesTable)
              .where(inArray(categoriesTable.id, catIds))
              .orderBy(asc(categoriesTable.id))
              .for("update");

            const lockedCatMap = new Map(lockedCats.map((c) => [c.id, c]));

            // INV-03: Verify physical stock before decrementing
            for (const item of items) {
              const cat = lockedCatMap.get(item.categoryId)!;
              const qty = numberValue(item.quantity);
              if (item.unit === "half_kilo") {
                if (numberValue(cat.halfKiloStock) < qty) {
                  throw new InsufficientStockError(`المخزون الفعلي لنصف كيلو ${cat.name} غير كافٍ لإتمام التسليم`);
                }
              } else {
                if (numberValue(cat.stockQuantity) < qty) {
                  throw new InsufficientStockError(`المخزون الفعلي من ${cat.name} غير كافٍ لإتمام التسليم`);
                }
              }
            }

            for (const item of items) {
              const qty = numberValue(item.quantity);
              if (item.unit === "half_kilo") {
                await tx
                  .update(categoriesTable)
                  .set({
                    halfKiloStock: sql`(${categoriesTable.halfKiloStock}::numeric - ${qty})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              } else {
                await tx
                  .update(categoriesTable)
                  .set({
                    stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric - ${qty})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              }
            }
          } else if (existingOrder.status === "delivered" && input.status !== undefined && input.status !== "delivered") {
            const items = await tx
              .select()
              .from(orderItemsTable)
              .where(eq(orderItemsTable.orderId, orderId));

            for (const item of items) {
              const qty = numberValue(item.quantity);
              if (item.unit === "half_kilo") {
                await tx
                  .update(categoriesTable)
                  .set({
                    halfKiloStock: sql`(${categoriesTable.halfKiloStock}::numeric + ${qty})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              } else {
                await tx
                  .update(categoriesTable)
                  .set({
                    stockQuantity: sql`(${categoriesTable.stockQuantity}::numeric + ${qty})::numeric(10,2)`,
                  })
                  .where(eq(categoriesTable.id, item.categoryId));
              }
            }
          }

          const [upd] = await tx
            .update(ordersTable)
            .set(orderPatch)
            .where(eq(ordersTable.id, orderId))
            .returning();

          return upd;
        });

        if (updated) {
          const fetched = (await listOrderRecords({ limit: 1 })).find((o) => o.id === orderId);
          res.json(fetched);
          return;
        }
      } catch (err: any) {
        if (err instanceof InsufficientStockError) {
          res.status(409).json({ error: err.message });
          return;
        }
        console.error("Patch order DB error:", err);
      }
    }

    const order = fallbackOrders.find((o) => o.id === orderId);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    Object.assign(order, input);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

/* ========================================================================== */
/* DASHBOARD ENDPOINTS (PERF-01 Pushed to PostgreSQL)                         */
/* ========================================================================== */

router.get("/dashboard/summary", requirePermission("analytics"), async (_req, res, next) => {
  try {
    const summary = await getAggregatedDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/analytics", requirePermission("analytics"), async (req, res, next) => {
  try {
    const orders = await listOrderRecords({ limit: 5000 });
    const timeframe = req.query.timeframe || "all";
    const dateFilter = req.query.date ? String(req.query.date) : undefined;
    const statusMode = req.query.statusMode || "confirmed";

    const filtered = orders.filter((order) => {
      if (statusMode === "delivered" && order.status !== "delivered") return false;
      if (statusMode === "confirmed" && ["rejected", "pending"].includes(order.status)) return false;
      if (dateFilter && order.pickupDate !== dateFilter) return false;
      return true;
    });

    const dailyPoints = new Map<string, { orders: number; revenue: number }>();
    const catTotals = new Map<number, { name: string; unit: string; qty: number; rev: number }>();
    const statusCounts = new Map<string, number>();

    let totalRev = 0;
    let totalKg = 0;
    let totalBoxes = 0;
    let totalPieces = 0;

    for (const order of filtered) {
      totalRev += order.totalPrice;
      statusCounts.set(order.status, (statusCounts.get(order.status) || 0) + 1);

      const dp = dailyPoints.get(order.pickupDate) || { orders: 0, revenue: 0 };
      dp.orders++;
      dp.revenue += order.totalPrice;
      dailyPoints.set(order.pickupDate, dp);

      for (const item of order.items) {
        const ct = catTotals.get(item.categoryId) || {
          name: item.categoryName,
          unit: item.unit,
          qty: 0,
          rev: 0,
        };
        ct.qty += item.quantity;
        ct.rev += item.subtotal;
        catTotals.set(item.categoryId, ct);

        if (item.unit === "kilo") totalKg += item.quantity;
        else if (item.unit === "half_kilo") totalKg += item.quantity * 0.5;
        else if (item.unit === "box") totalBoxes += item.quantity;
        else if (item.unit === "piece") totalPieces += item.quantity;
      }
    }

    res.json({
      dailyOrders: Array.from(dailyPoints.entries()).map(([date, d]) => ({
        date,
        orders: d.orders,
        revenue: Number(d.revenue.toFixed(2)),
      })),
      categoryTotals: Array.from(catTotals.entries()).map(([categoryId, c]) => ({
        categoryId,
        categoryName: c.name,
        unit: c.unit,
        imageUrl: null,
        quantity: c.qty,
        revenue: Number(c.rev.toFixed(2)),
        totalWeightKg: c.unit === "kilo" ? c.qty : c.unit === "half_kilo" ? c.qty * 0.5 : 0,
        kilosSold: c.unit === "kilo" ? c.qty : 0,
        halfKilosSold: c.unit === "half_kilo" ? c.qty : 0,
        boxesSold: c.unit === "box" ? c.qty : 0,
        piecesSold: c.unit === "piece" ? c.qty : 0,
        ordersCount: 1,
        revenueShare: totalRev > 0 ? Number(((c.rev / totalRev) * 100).toFixed(1)) : 0,
      })),
      statusTotals: Array.from(statusCounts.entries()).map(([status, count]) => ({
        status: status as any,
        count,
      })),
      summary: {
        totalRevenue: Number(totalRev.toFixed(2)),
        totalWeightKg: Number(totalKg.toFixed(2)),
        totalBoxes,
        totalPieces,
        totalOrders: filtered.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
