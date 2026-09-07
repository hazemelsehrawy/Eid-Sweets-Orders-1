import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoryUnitEnum = pgEnum("category_unit", ["kilo", "box", "piece"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "accepted",
  "rejected",
  "preparing",
  "ready",
  "delivered",
]);
export const orderCreatedByEnum = pgEnum("order_created_by", ["guest", "admin"]);

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  unit: categoryUnitEnum("unit").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 10, scale: 2 }).notNull(),
  stockQuantity: numeric("stock_quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale: 2 }).notNull().default("5"),
  isActive: boolean("is_active").notNull().default(true),
});

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 160 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 32 }).notNull(),
  pickupDate: date("pickup_date", { mode: "string" }).notNull(),
  pickupTime: varchar("pickup_time", { length: 32 }).notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
  createdBy: orderCreatedByEnum("created_by").notNull().default("guest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
});
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });

export type Category = typeof categoriesTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;