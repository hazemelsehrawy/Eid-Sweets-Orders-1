import crypto from "crypto";
import {
  db,
  ordersTable,
  orderItemsTable,
  categoriesTable,
  type Order,
  type OrderItem,
} from "@workspace/db";
import { eq, and, or, inArray, sql, desc, asc, ilike } from "drizzle-orm";
import { numberValue, fallbackCategories, FallbackCategory } from "./category.service";

export const ACTIVE_ORDER_STATUSES = ["pending", "accepted", "preparing", "ready"] as const;

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[\\%_]/g, "\\$&");
}

export function maskCustomerName(name: string): string {
  const trimmed = (name || "").trim();
  if (trimmed.length <= 2) return trimmed + "***";
  return trimmed.slice(0, 2) + "***";
}

export function maskPhoneNumber(phone: string): string {
  const clean = (phone || "").replace(/\D/g, "");
  if (clean.length < 7) return "***";
  return clean.slice(0, 3) + "****" + clean.slice(-4);
}

export function parseDepositAmount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) || val < 0 ? 0 : val;
  let str = String(val).trim();
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(arabicDigits[i], String(i));
  }
  str = str.replace(/٫/g, ".").replace(/,/g, ".");
  const match = str.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
}

export function toDateString(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(val);
    } catch {
      return val.toISOString().slice(0, 10);
    }
  }
  const s = String(val).trim();
  if (s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
  return s;
}

export interface FallbackOrderItem {
  id: number;
  categoryId: number;
  categoryName: string;
  unit: string;
  quantity: number;
  subtotal: number;
}

export interface FallbackOrder {
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

export const fallbackOrders: FallbackOrder[] = [];
let nextFallbackOrderId = 0;

// INV-05: Scope getActiveReservations by category IDs when provided
export async function getActiveReservations(
  dbExecutor?: any,
  filterCategoryIds?: number[],
): Promise<Map<number, { regular: number; halfKilo: number }>> {
  const result = new Map<number, { regular: number; halfKilo: number }>();

  if (dbExecutor || process.env.DATABASE_URL) {
    try {
      const executor = dbExecutor || db;
      let query = executor
        .select({
          categoryId: orderItemsTable.categoryId,
          unit: orderItemsTable.unit,
          quantity: orderItemsTable.quantity,
        })
        .from(orderItemsTable)
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id));

      const conditions = [inArray(ordersTable.status, [...ACTIVE_ORDER_STATUSES])];
      if (filterCategoryIds && filterCategoryIds.length > 0) {
        conditions.push(inArray(orderItemsTable.categoryId, filterCategoryIds));
      }

      const activeRows = await query.where(and(...conditions));

      for (const row of activeRows) {
        const current = result.get(row.categoryId) || { regular: 0, halfKilo: 0 };
        const qty = numberValue(row.quantity);
        if (row.unit === "half_kilo") {
          current.halfKilo = Number((current.halfKilo + qty).toFixed(2));
        } else {
          current.regular = Number((current.regular + qty).toFixed(2));
        }
        result.set(row.categoryId, current);
      }
      return result;
    } catch (err) {
      console.error("getActiveReservations DB error:", err);
    }
  }

  // Memory fallback
  for (const order of fallbackOrders) {
    if (ACTIVE_ORDER_STATUSES.includes(order.status as any)) {
      for (const item of order.items) {
        if (filterCategoryIds && filterCategoryIds.length > 0 && !filterCategoryIds.includes(item.categoryId)) {
          continue;
        }
        const current = result.get(item.categoryId) || { regular: 0, halfKilo: 0 };
        const qty = numberValue(item.quantity);
        if (item.unit === "half_kilo") {
          current.halfKilo = Number((current.halfKilo + qty).toFixed(2));
        } else {
          current.regular = Number((current.regular + qty).toFixed(2));
        }
        result.set(item.categoryId, current);
      }
    }
  }
  return result;
}

export async function generateUniqueOrderNumber(
  dbExecutor?: any,
  customFallbackList?: Array<{ orderNumber: string }>,
): Promise<string> {
  const maxAttemptsPerLength = 5;
  let min = 10000;
  let max = 99999;

  while (true) {
    for (let attempt = 0; attempt < maxAttemptsPerLength; attempt++) {
      const candidate = String(crypto.randomInt(min, max + 1));

      if (dbExecutor || process.env.DATABASE_URL) {
        try {
          const executor = dbExecutor || db;
          const [existing] = await executor
            .select({ id: ordersTable.id })
            .from(ordersTable)
            .where(eq(ordersTable.orderNumber, candidate))
            .limit(1);

          if (!existing) {
            return candidate;
          }
        } catch {
          const list = customFallbackList || fallbackOrders;
          const existing = list.some((o) => o.orderNumber === candidate);
          if (!existing) {
            return candidate;
          }
        }
      } else {
        const list = customFallbackList || fallbackOrders;
        const existing = list.some((o) => o.orderNumber === candidate);
        if (!existing) {
          return candidate;
        }
      }
    }
    min = min * 10;
    max = max * 10 + 9;
  }
}

export async function generateNextPosOrderNumber(
  dbExecutor?: any,
  customFallbackList?: Array<{ orderNumber: string }>,
): Promise<string> {
  const posRegex = /^(\d{3})(?:-(\d+))?$/;
  let latestSeq = 0;
  let latestCycle = 1;

  if (customFallbackList) {
    for (let i = customFallbackList.length - 1; i >= 0; i--) {
      const match = customFallbackList[i].orderNumber.match(posRegex);
      if (match) {
        latestSeq = parseInt(match[1], 10);
        latestCycle = match[2] ? parseInt(match[2], 10) : 1;
        break;
      }
    }
  } else if (dbExecutor || process.env.DATABASE_URL) {
    try {
      const executor = dbExecutor || db;
      if (dbExecutor) {
        try {
          await executor.execute(sql`SELECT pg_advisory_xact_lock(746352);`);
        } catch {}
      }

      const [latest] = await executor
        .select({ orderNumber: ordersTable.orderNumber })
        .from(ordersTable)
        .where(sql`${ordersTable.orderNumber} ~ '^[0-9]{3}(-[0-9]+)?$'`)
        .orderBy(desc(ordersTable.id))
        .limit(1);

      if (latest?.orderNumber) {
        const match = latest.orderNumber.match(posRegex);
        if (match) {
          latestSeq = parseInt(match[1], 10);
          latestCycle = match[2] ? parseInt(match[2], 10) : 1;
        }
      }
    } catch {
      for (let i = fallbackOrders.length - 1; i >= 0; i--) {
        const match = fallbackOrders[i].orderNumber.match(posRegex);
        if (match) {
          latestSeq = parseInt(match[1], 10);
          latestCycle = match[2] ? parseInt(match[2], 10) : 1;
          break;
        }
      }
    }
  } else {
    for (let i = fallbackOrders.length - 1; i >= 0; i--) {
      const match = fallbackOrders[i].orderNumber.match(posRegex);
      if (match) {
        latestSeq = parseInt(match[1], 10);
        latestCycle = match[2] ? parseInt(match[2], 10) : 1;
        break;
      }
    }
  }

  let nextSeq: number;
  let nextCycle: number;

  if (latestSeq <= 0 || latestSeq >= 500) {
    nextSeq = 1;
    nextCycle = latestSeq >= 500 ? latestCycle + 1 : 1;
  } else {
    nextSeq = latestSeq + 1;
    nextCycle = latestCycle;
  }

  while (true) {
    const padded = String(nextSeq).padStart(3, "0");
    const candidate = nextCycle === 1 ? padded : `${padded}-${nextCycle}`;

    if (customFallbackList) {
      const existing = customFallbackList.some((o) => o.orderNumber === candidate);
      if (!existing) {
        return candidate;
      }
    } else if (dbExecutor || process.env.DATABASE_URL) {
      try {
        const executor = dbExecutor || db;
        const [existing] = await executor
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(eq(ordersTable.orderNumber, candidate))
          .limit(1);

        if (!existing) {
          return candidate;
        }
      } catch {
        const existing = fallbackOrders.some((o) => o.orderNumber === candidate);
        if (!existing) {
          return candidate;
        }
      }
    } else {
      const existing = fallbackOrders.some((o) => o.orderNumber === candidate);
      if (!existing) {
        return candidate;
      }
    }

    nextSeq++;
    if (nextSeq > 500) {
      nextSeq = 1;
      nextCycle++;
    }
  }
}
