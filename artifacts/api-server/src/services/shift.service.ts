import {
  db,
  ordersTable,
  staffShiftsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { numberValue } from "./category.service";
import { getLocalTodayString } from "./dashboard.service";
import { ensureDatabaseSchema } from "./db-init.service";
import { fallbackOrders, toDateString } from "./order.service";
import { fallbackUsers, type StaffPermission } from "./staff-auth.service";

export class ShiftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftConflictError";
  }
}

export class ShiftNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftNotFoundError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeNotFoundError";
  }
}

export interface ShiftPaymentBreakdown {
  cash: number;
  instapay: number;
  vodafone_cash: number;
  card: number;
}

export interface StaffShiftSummary {
  id: number;
  userId: string;
  shiftDate: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "closed";
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  paymentBreakdown: ShiftPaymentBreakdown;
  notes: string | null;
  employeeName?: string;
  employeeUsername?: string;
  employeeRole?: "owner" | "staff";
}

export interface DailyEmployeeRevenueRow {
  date: string;
  shifts: StaffShiftSummary[];
  offShiftOrdersCount: number;
  offShiftRevenue: number;
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  paymentBreakdown: ShiftPaymentBreakdown;
}

export interface EmployeeProfileUser {
  userId: string;
  fullName: string;
  username: string;
  email: string;
  role: "owner" | "staff";
  status: "approved" | "pending" | "rejected";
  staffAccess: boolean;
  permissions: StaffPermission[];
}

export interface EmployeeRevenueProfile {
  employee: EmployeeProfileUser;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalShifts: number;
    activeShiftsCount: number;
    daysWorked: number;
    paymentBreakdown: ShiftPaymentBreakdown;
  };
  days: DailyEmployeeRevenueRow[];
}

export interface ShiftsOverviewResponse {
  todayDate: string;
  activeShifts: StaffShiftSummary[];
  closedShifts: StaffShiftSummary[];
  summary: {
    totalActiveShifts: number;
    totalClosedShifts: number;
    totalDeliveredOrders: number;
    totalDeliveredRevenue: number;
  };
}

export interface FallbackShift {
  id: number;
  userId: string;
  shiftDate: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "closed";
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  cashTotal: number;
  instapayTotal: number;
  vodafoneCashTotal: number;
  cardTotal: number;
  notes: string | null;
  createdAt: string;
}

export const fallbackShifts: FallbackShift[] = [];
let nextFallbackShiftId = 0;

function roundMoney(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function emptyBreakdown(): ShiftPaymentBreakdown {
  return {
    cash: 0,
    instapay: 0,
    vodafone_cash: 0,
    card: 0,
  };
}

function addToBreakdown(
  target: ShiftPaymentBreakdown,
  paymentMethod: string | null | undefined,
  amount: number,
) {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (paymentMethod === "instapay") {
    target.instapay = roundMoney(target.instapay + safe);
  } else if (paymentMethod === "vodafone_cash") {
    target.vodafone_cash = roundMoney(target.vodafone_cash + safe);
  } else if (paymentMethod === "card") {
    target.card = roundMoney(target.card + safe);
  } else {
    target.cash = roundMoney(target.cash + safe);
  }
}

function mergeBreakdowns(
  target: ShiftPaymentBreakdown,
  source: ShiftPaymentBreakdown,
) {
  target.cash = roundMoney(target.cash + source.cash);
  target.instapay = roundMoney(target.instapay + source.instapay);
  target.vodafone_cash = roundMoney(target.vodafone_cash + source.vodafone_cash);
  target.card = roundMoney(target.card + source.card);
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return isoDate;
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

function matchesTimeframeDate(
  rowDate: string,
  todayStr: string,
  timeframe?: string,
  dateFilter?: string,
): boolean {
  if (dateFilter) {
    return rowDate === dateFilter;
  }
  if (timeframe === "today") {
    return rowDate === todayStr;
  }
  if (timeframe === "week") {
    const weekStart = shiftIsoDate(todayStr, -6);
    return rowDate >= weekStart && rowDate <= todayStr;
  }
  if (timeframe === "month") {
    return rowDate.slice(0, 7) === todayStr.slice(0, 7);
  }
  return true;
}

async function computeLiveShiftMetrics(
  shiftId: number,
): Promise<{
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  paymentBreakdown: ShiftPaymentBreakdown;
}> {
  const breakdown = emptyBreakdown();
  let count = 0;
  let revenue = 0;

  if (process.env.DATABASE_URL) {
    try {
      const rows = await db
        .select({
          totalPrice: ordersTable.totalPrice,
          paymentMethod: ordersTable.paymentMethod,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.shiftId, shiftId),
            eq(ordersTable.status, "delivered"),
          ),
        );

      for (const row of rows) {
        const price = numberValue(row.totalPrice);
        count += 1;
        revenue += price;
        addToBreakdown(breakdown, row.paymentMethod, price);
      }

      return {
        deliveredOrdersCount: count,
        deliveredRevenue: roundMoney(revenue),
        paymentBreakdown: breakdown,
      };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  for (const order of fallbackOrders) {
    if (order.shiftId === shiftId && order.status === "delivered") {
      count += 1;
      revenue += order.totalPrice;
      addToBreakdown(breakdown, order.paymentMethod, order.totalPrice);
    }
  }

  return {
    deliveredOrdersCount: count,
    deliveredRevenue: roundMoney(revenue),
    paymentBreakdown: breakdown,
  };
}

function toClosedShiftSummary(
  row: {
    id: number;
    userId: string;
    shiftDate: string;
    startedAt: Date | string;
    endedAt: Date | string | null;
    status: string;
    deliveredOrdersCount: number;
    deliveredRevenue: string | number | null | undefined;
    cashTotal: string | number | null | undefined;
    instapayTotal: string | number | null | undefined;
    vodafoneCashTotal: string | number | null | undefined;
    cardTotal: string | number | null | undefined;
    notes: string | null;
  },
  userInfo?: { fullName: string; username: string; role: "owner" | "staff" },
): StaffShiftSummary {
  return {
    id: row.id,
    userId: String(row.userId),
    shiftDate: toDateString(row.shiftDate),
    startedAt:
      row.startedAt instanceof Date
        ? row.startedAt.toISOString()
        : String(row.startedAt),
    endedAt:
      row.endedAt instanceof Date
        ? row.endedAt.toISOString()
        : row.endedAt
        ? String(row.endedAt)
        : null,
    status: row.status === "active" ? "active" : "closed",
    deliveredOrdersCount: Number(row.deliveredOrdersCount) || 0,
    deliveredRevenue: roundMoney(numberValue(row.deliveredRevenue)),
    paymentBreakdown: {
      cash: roundMoney(numberValue(row.cashTotal)),
      instapay: roundMoney(numberValue(row.instapayTotal)),
      vodafone_cash: roundMoney(numberValue(row.vodafoneCashTotal)),
      card: roundMoney(numberValue(row.cardTotal)),
    },
    notes: row.notes ?? null,
    ...(userInfo
      ? {
          employeeName: userInfo.fullName,
          employeeUsername: userInfo.username,
          employeeRole: userInfo.role,
        }
      : {}),
  };
}

async function getUsersDirectoryMap(): Promise<Map<string, EmployeeProfileUser>> {
  const map = new Map<string, EmployeeProfileUser>();

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const dbUsers = await db
        .select()
        .from(usersTable)
        .orderBy(asc(usersTable.id));
      for (const u of dbUsers) {
        map.set(String(u.id), {
          userId: String(u.id),
          fullName: u.fullName,
          username: u.username,
          email: u.email || `${u.username}@local`,
          role: u.role === "owner" ? "owner" : "staff",
          status: (u.status as EmployeeProfileUser["status"]) || "pending",
          staffAccess: u.staffAccess,
          permissions: ((u.permissions || []) as StaffPermission[]),
        });
      }
      if (map.size > 0) return map;
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  for (const u of fallbackUsers) {
    map.set(String(u.id), {
      userId: String(u.id),
      fullName: u.fullName,
      username: u.username,
      email: u.email || `${u.username}@local`,
      role: u.role,
      status: u.status,
      staffAccess: u.staffAccess,
      permissions: u.permissions,
    });
  }

  return map;
}

export async function getActiveShiftRecord(userId: string): Promise<{
  id: number;
  userId: string;
  shiftDate: string;
  startedAt: string;
} | null> {
  const normalizedUserId = String(userId);

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const [active] = await db
        .select({
          id: staffShiftsTable.id,
          userId: staffShiftsTable.userId,
          shiftDate: staffShiftsTable.shiftDate,
          startedAt: staffShiftsTable.startedAt,
        })
        .from(staffShiftsTable)
        .where(
          and(
            eq(staffShiftsTable.userId, normalizedUserId),
            eq(staffShiftsTable.status, "active"),
          ),
        )
        .orderBy(desc(staffShiftsTable.startedAt))
        .limit(1);

      if (!active) return null;
      return {
        id: active.id,
        userId: String(active.userId),
        shiftDate: toDateString(active.shiftDate),
        startedAt:
          active.startedAt instanceof Date
            ? active.startedAt.toISOString()
            : String(active.startedAt),
      };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  const found = fallbackShifts.find(
    (s) => s.userId === normalizedUserId && s.status === "active",
  );
  if (!found) return null;
  return {
    id: found.id,
    userId: found.userId,
    shiftDate: found.shiftDate,
    startedAt: found.startedAt,
  };
}

export async function getActiveShiftForUser(
  userId: string,
): Promise<StaffShiftSummary | null> {
  const active = await getActiveShiftRecord(userId);
  if (!active) return null;

  const live = await computeLiveShiftMetrics(active.id);
  return {
    id: active.id,
    userId: active.userId,
    shiftDate: active.shiftDate,
    startedAt: active.startedAt,
    endedAt: null,
    status: "active",
    deliveredOrdersCount: live.deliveredOrdersCount,
    deliveredRevenue: live.deliveredRevenue,
    paymentBreakdown: live.paymentBreakdown,
    notes: null,
  };
}

export async function startShiftForUser(
  userId: string,
): Promise<StaffShiftSummary> {
  const normalizedUserId = String(userId);
  const existing = await getActiveShiftRecord(normalizedUserId);
  if (existing) {
    throw new ShiftConflictError("لديك وردية نشطة بالفعل");
  }

  const todayStr = getLocalTodayString();

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const [created] = await db
        .insert(staffShiftsTable)
        .values({
          userId: normalizedUserId,
          shiftDate: todayStr,
          status: "active",
        })
        .returning();

      return {
        id: created.id,
        userId: String(created.userId),
        shiftDate: toDateString(created.shiftDate),
        startedAt:
          created.startedAt instanceof Date
            ? created.startedAt.toISOString()
            : String(created.startedAt),
        endedAt: null,
        status: "active",
        deliveredOrdersCount: 0,
        deliveredRevenue: 0,
        paymentBreakdown: emptyBreakdown(),
        notes: null,
      };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  const nowIso = new Date().toISOString();
  const created: FallbackShift = {
    id: ++nextFallbackShiftId,
    userId: normalizedUserId,
    shiftDate: todayStr,
    startedAt: nowIso,
    endedAt: null,
    status: "active",
    deliveredOrdersCount: 0,
    deliveredRevenue: 0,
    cashTotal: 0,
    instapayTotal: 0,
    vodafoneCashTotal: 0,
    cardTotal: 0,
    notes: null,
    createdAt: nowIso,
  };
  fallbackShifts.push(created);

  return {
    id: created.id,
    userId: created.userId,
    shiftDate: created.shiftDate,
    startedAt: created.startedAt,
    endedAt: null,
    status: "active",
    deliveredOrdersCount: 0,
    deliveredRevenue: 0,
    paymentBreakdown: emptyBreakdown(),
    notes: null,
  };
}

export async function endShiftForUser(
  userId: string,
  notes?: string,
): Promise<StaffShiftSummary> {
  const normalizedUserId = String(userId);
  const active = await getActiveShiftRecord(normalizedUserId);
  if (!active) {
    throw new ShiftNotFoundError("لا توجد وردية نشطة لإنهائها");
  }

  const metrics = await computeLiveShiftMetrics(active.id);
  const cleanNotes = notes?.trim() ? notes.trim() : null;
  const endedAtDate = new Date();

  if (process.env.DATABASE_URL) {
    try {
      const [closed] = await db
        .update(staffShiftsTable)
        .set({
          endedAt: endedAtDate,
          status: "closed",
          deliveredOrdersCount: metrics.deliveredOrdersCount,
          deliveredRevenue: metrics.deliveredRevenue.toFixed(2),
          cashTotal: metrics.paymentBreakdown.cash.toFixed(2),
          instapayTotal: metrics.paymentBreakdown.instapay.toFixed(2),
          vodafoneCashTotal: metrics.paymentBreakdown.vodafone_cash.toFixed(2),
          cardTotal: metrics.paymentBreakdown.card.toFixed(2),
          notes: cleanNotes,
        })
        .where(eq(staffShiftsTable.id, active.id))
        .returning();

      return toClosedShiftSummary(closed);
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  const memShift = fallbackShifts.find((s) => s.id === active.id);
  if (!memShift) {
    throw new ShiftNotFoundError("لا توجد وردية نشطة لإنهائها");
  }

  memShift.endedAt = endedAtDate.toISOString();
  memShift.status = "closed";
  memShift.deliveredOrdersCount = metrics.deliveredOrdersCount;
  memShift.deliveredRevenue = metrics.deliveredRevenue;
  memShift.cashTotal = metrics.paymentBreakdown.cash;
  memShift.instapayTotal = metrics.paymentBreakdown.instapay;
  memShift.vodafoneCashTotal = metrics.paymentBreakdown.vodafone_cash;
  memShift.cardTotal = metrics.paymentBreakdown.card;
  memShift.notes = cleanNotes;

  return toClosedShiftSummary(memShift);
}

export async function getTodayShiftsOverview(): Promise<ShiftsOverviewResponse> {
  const todayStr = getLocalTodayString();
  const usersMap = await getUsersDirectoryMap();

  const rawShifts: Array<FallbackShift> = [];

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const rows = await db
        .select()
        .from(staffShiftsTable)
        .where(eq(staffShiftsTable.shiftDate, todayStr))
        .orderBy(desc(staffShiftsTable.startedAt));

      const stillActiveOld = await db
        .select()
        .from(staffShiftsTable)
        .where(eq(staffShiftsTable.status, "active"))
        .orderBy(desc(staffShiftsTable.startedAt));

      const seen = new Set<number>();
      for (const r of [...stillActiveOld, ...rows]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        rawShifts.push({
          id: r.id,
          userId: String(r.userId),
          shiftDate: toDateString(r.shiftDate),
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt ? r.endedAt.toISOString() : null,
          status: r.status === "active" ? "active" : "closed",
          deliveredOrdersCount: r.deliveredOrdersCount,
          deliveredRevenue: numberValue(r.deliveredRevenue),
          cashTotal: numberValue(r.cashTotal),
          instapayTotal: numberValue(r.instapayTotal),
          vodafoneCashTotal: numberValue(r.vodafoneCashTotal),
          cardTotal: numberValue(r.cardTotal),
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
        });
      }
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  if (rawShifts.length === 0 && !process.env.DATABASE_URL) {
    for (const s of fallbackShifts) {
      if (s.shiftDate === todayStr || s.status === "active") {
        rawShifts.push(s);
      }
    }
  }

  const activeShifts: StaffShiftSummary[] = [];
  const closedShifts: StaffShiftSummary[] = [];

  for (const shift of rawShifts) {
    const userInfo = usersMap.get(String(shift.userId));
    const userMeta = userInfo
      ? {
          fullName: userInfo.fullName,
          username: userInfo.username,
          role: userInfo.role,
        }
      : {
          fullName: `موظف #${shift.userId}`,
          username: String(shift.userId),
          role: "staff" as const,
        };

    if (shift.status === "active") {
      const live = await computeLiveShiftMetrics(shift.id);
      activeShifts.push({
        id: shift.id,
        userId: String(shift.userId),
        shiftDate: shift.shiftDate,
        startedAt: shift.startedAt,
        endedAt: null,
        status: "active",
        deliveredOrdersCount: live.deliveredOrdersCount,
        deliveredRevenue: live.deliveredRevenue,
        paymentBreakdown: live.paymentBreakdown,
        notes: shift.notes,
        employeeName: userMeta.fullName,
        employeeUsername: userMeta.username,
        employeeRole: userMeta.role,
      });
    } else {
      closedShifts.push(toClosedShiftSummary(shift, userMeta));
    }
  }

  const allShifts = [...activeShifts, ...closedShifts];
  const totalDeliveredOrders = allShifts.reduce(
    (sum, s) => sum + s.deliveredOrdersCount,
    0,
  );
  const totalDeliveredRevenue = roundMoney(
    allShifts.reduce((sum, s) => sum + s.deliveredRevenue, 0),
  );

  return {
    todayDate: todayStr,
    activeShifts,
    closedShifts,
    summary: {
      totalActiveShifts: activeShifts.length,
      totalClosedShifts: closedShifts.length,
      totalDeliveredOrders,
      totalDeliveredRevenue,
    },
  };
}

export async function getEmployeeRevenueProfile(
  userId: string,
  filters: { timeframe?: string; date?: string } = {},
): Promise<EmployeeRevenueProfile> {
  const normalizedUserId = String(userId);
  const usersMap = await getUsersDirectoryMap();
  const employee = usersMap.get(normalizedUserId);
  if (!employee) {
    throw new EmployeeNotFoundError("الموظف غير موجود");
  }

  const todayStr = getLocalTodayString();
  const dateFilter = filters.date ? toDateString(filters.date) : undefined;
  const timeframe = filters.timeframe || "all";

  let userShifts: FallbackShift[] = [];
  let offShiftDeliveredOrders: Array<{
    orderDate: string;
    totalPrice: number;
    paymentMethod: string;
  }> = [];

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const dbShifts = await db
        .select()
        .from(staffShiftsTable)
        .where(eq(staffShiftsTable.userId, normalizedUserId))
        .orderBy(desc(staffShiftsTable.startedAt));

      userShifts = dbShifts.map((r) => ({
        id: r.id,
        userId: String(r.userId),
        shiftDate: toDateString(r.shiftDate),
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        status: r.status === "active" ? "active" : "closed",
        deliveredOrdersCount: r.deliveredOrdersCount,
        deliveredRevenue: numberValue(r.deliveredRevenue),
        cashTotal: numberValue(r.cashTotal),
        instapayTotal: numberValue(r.instapayTotal),
        vodafoneCashTotal: numberValue(r.vodafoneCashTotal),
        cardTotal: numberValue(r.cardTotal),
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      }));

      const dbOffShift = await db
        .select({
          deliveredAt: ordersTable.deliveredAt,
          pickupDate: ordersTable.pickupDate,
          createdAt: ordersTable.createdAt,
          totalPrice: ordersTable.totalPrice,
          paymentMethod: ordersTable.paymentMethod,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.deliveredByUserId, normalizedUserId),
            eq(ordersTable.status, "delivered"),
            isNull(ordersTable.shiftId),
          ),
        );

      offShiftDeliveredOrders = dbOffShift.map((o) => ({
        orderDate: toDateString(o.deliveredAt || o.pickupDate || o.createdAt),
        totalPrice: numberValue(o.totalPrice),
        paymentMethod: o.paymentMethod,
      }));
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  } else {
    userShifts = fallbackShifts.filter((s) => s.userId === normalizedUserId);
    offShiftDeliveredOrders = fallbackOrders
      .filter(
        (o) =>
          o.deliveredByUserId === normalizedUserId &&
          o.status === "delivered" &&
          (o.shiftId === null || o.shiftId === undefined),
      )
      .map((o) => ({
        orderDate: toDateString(o.deliveredAt || o.pickupDate || o.createdAt),
        totalPrice: o.totalPrice,
        paymentMethod: o.paymentMethod,
      }));
  }

  const daysMap = new Map<string, DailyEmployeeRevenueRow>();
  const ensureDayRow = (dateKey: string): DailyEmployeeRevenueRow => {
    let row = daysMap.get(dateKey);
    if (!row) {
      row = {
        date: dateKey,
        shifts: [],
        offShiftOrdersCount: 0,
        offShiftRevenue: 0,
        deliveredOrdersCount: 0,
        deliveredRevenue: 0,
        paymentBreakdown: emptyBreakdown(),
      };
      daysMap.set(dateKey, row);
    }
    return row;
  };

  for (const shift of userShifts) {
    if (!matchesTimeframeDate(shift.shiftDate, todayStr, timeframe, dateFilter)) {
      continue;
    }

    let summaryShift: StaffShiftSummary;
    if (shift.status === "active") {
      const live = await computeLiveShiftMetrics(shift.id);
      summaryShift = {
        id: shift.id,
        userId: shift.userId,
        shiftDate: shift.shiftDate,
        startedAt: shift.startedAt,
        endedAt: null,
        status: "active",
        deliveredOrdersCount: live.deliveredOrdersCount,
        deliveredRevenue: live.deliveredRevenue,
        paymentBreakdown: live.paymentBreakdown,
        notes: shift.notes,
        employeeName: employee.fullName,
        employeeUsername: employee.username,
        employeeRole: employee.role,
      };
    } else {
      summaryShift = toClosedShiftSummary(shift, {
        fullName: employee.fullName,
        username: employee.username,
        role: employee.role,
      });
    }

    const dayRow = ensureDayRow(shift.shiftDate);
    dayRow.shifts.push(summaryShift);
    dayRow.deliveredOrdersCount += summaryShift.deliveredOrdersCount;
    dayRow.deliveredRevenue = roundMoney(
      dayRow.deliveredRevenue + summaryShift.deliveredRevenue,
    );
    mergeBreakdowns(dayRow.paymentBreakdown, summaryShift.paymentBreakdown);
  }

  for (const offOrder of offShiftDeliveredOrders) {
    if (!matchesTimeframeDate(offOrder.orderDate, todayStr, timeframe, dateFilter)) {
      continue;
    }

    const dayRow = ensureDayRow(offOrder.orderDate);
    dayRow.offShiftOrdersCount += 1;
    dayRow.offShiftRevenue = roundMoney(
      dayRow.offShiftRevenue + offOrder.totalPrice,
    );
    dayRow.deliveredOrdersCount += 1;
    dayRow.deliveredRevenue = roundMoney(
      dayRow.deliveredRevenue + offOrder.totalPrice,
    );
    addToBreakdown(dayRow.paymentBreakdown, offOrder.paymentMethod, offOrder.totalPrice);
  }

  const days = Array.from(daysMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  for (const day of days) {
    day.shifts.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
  }

  const totalPaymentBreakdown = emptyBreakdown();
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalShifts = 0;
  let activeShiftsCount = 0;

  for (const day of days) {
    totalRevenue = roundMoney(totalRevenue + day.deliveredRevenue);
    totalOrders += day.deliveredOrdersCount;
    totalShifts += day.shifts.length;
    activeShiftsCount += day.shifts.filter((s) => s.status === "active").length;
    mergeBreakdowns(totalPaymentBreakdown, day.paymentBreakdown);
  }

  return {
    employee,
    summary: {
      totalRevenue,
      totalOrders,
      totalShifts,
      activeShiftsCount,
      daysWorked: days.length,
      paymentBreakdown: totalPaymentBreakdown,
    },
    days,
  };
}
