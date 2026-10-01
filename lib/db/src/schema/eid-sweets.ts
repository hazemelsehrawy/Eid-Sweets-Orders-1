import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
});

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "instapay", "vodafone_cash", "card"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "partially_paid", "paid"]);

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
    customerName: varchar("customer_name", { length: 160 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 32 }).notNull(),
    pickupDate: date("pickup_date", { mode: "string" }).notNull(),
    pickupTime: varchar("pickup_time", { length: 32 }).notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
    depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    remainingBalance: numeric("remaining_balance", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull().default("cash"),
    paymentStatus: varchar("payment_status", { length: 32 }).notNull().default("unpaid"),
    createdBy: orderCreatedByEnum("created_by").notNull().default("guest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_pickup_date_idx").on(table.pickupDate),
    index("orders_phone_number_idx").on(table.phoneNumber),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
  ],
);

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
  ],
);

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
});
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });

export const userRoleEnum = pgEnum("user_role", ["owner", "staff"]);
export const userStatusEnum = pgEnum("user_status", ["pending", "approved", "rejected"]);

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull().unique(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    email: varchar("email", { length: 160 }),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("staff"),
    status: userStatusEnum("status").notNull().default("pending"),
    staffAccess: boolean("staff_access").notNull().default(false),
    permissions: jsonb("permissions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_username_idx").on(table.username),
    index("users_role_idx").on(table.role),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Category = typeof categoriesTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;