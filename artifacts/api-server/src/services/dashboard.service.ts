import { db, ordersTable, orderItemsTable, categoriesTable } from "@workspace/db";
import { sql, eq, inArray, and } from "drizzle-orm";
import { numberValue } from "./category.service";

export function getLocalTodayString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function getAggregatedDashboardSummary() {
  const today = getLocalTodayString();
  const now = new Date();

  // Eid calculation
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
  const daysUntilEid = Math.max(0, Math.ceil((eid.getTime() - now.getTime()) / 86_400_000));

  if (process.env.DATABASE_URL) {
    try {
      // PERF-01: Single aggregation query for order metrics
      const [orderMetrics] = await db
        .select({
          pendingOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'pending')::int`,
          todayOrders: sql<number>`count(*) filter (where ${ordersTable.pickupDate} = ${today})::int`,
          acceptedRevenue: sql<string>`coalesce(sum(${ordersTable.totalPrice}::numeric) filter (where ${ordersTable.status} in ('accepted', 'preparing', 'ready', 'delivered')), 0)`,
          totalOrders: sql<number>`count(*)::int`,
        })
        .from(ordersTable);

      // Category low stock count directly in SQL
      const [lowStock] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.isActive, true),
            sql`(${categoriesTable.stockQuantity}::numeric <= ${categoriesTable.lowStockThreshold}::numeric or (${categoriesTable.unit} = 'kilo' and ${categoriesTable.halfKiloStock}::numeric <= ${categoriesTable.halfKiloThreshold}::numeric))`,
          ),
        );

      // Top category directly aggregated in SQL
      const [topCat] = await db
        .select({
          name: sql<string>`coalesce(nullif(${orderItemsTable.categoryNameSnapshot}, ''), ${categoriesTable.name}, 'حلويات العيد')`,
          totalQty: sql<number>`sum(${orderItemsTable.quantity}::numeric)`,
        })
        .from(orderItemsTable)
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
        .leftJoin(categoriesTable, eq(orderItemsTable.categoryId, categoriesTable.id))
        .where(sql`${ordersTable.status} != 'rejected'`)
        .groupBy(sql`1`)
        .orderBy(desc(sql`2`))
        .limit(1);

      return {
        pendingOrders: orderMetrics?.pendingOrders || 0,
        todayOrders: orderMetrics?.todayOrders || 0,
        acceptedRevenue: Number(numberValue(orderMetrics?.acceptedRevenue).toFixed(2)),
        lowStockCount: lowStock?.count || 0,
        totalOrders: orderMetrics?.totalOrders || 0,
        topCategory: topCat?.name || null,
        daysUntilEid,
      };
    } catch (err) {
      console.error("getAggregatedDashboardSummary SQL error:", err);
    }
  }

  return {
    pendingOrders: 0,
    todayOrders: 0,
    acceptedRevenue: 0,
    lowStockCount: 0,
    totalOrders: 0,
    topCategory: null,
    daysUntilEid,
  };
}

function desc(arg0: any): any {
  return sql`${arg0} desc`;
}
