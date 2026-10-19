CREATE TYPE "public"."category_unit" AS ENUM('kilo', 'half_kilo', 'box', 'piece');--> statement-breakpoint
CREATE TYPE "public"."order_created_by" AS ENUM('guest', 'admin');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'instapay', 'vodafone_cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"unit" "category_unit" NOT NULL,
	"price_per_unit" numeric(10, 2) NOT NULL,
	"stock_quantity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold" numeric(10, 2) DEFAULT '5' NOT NULL,
	"image_url" text,
	"half_kilo_price" numeric(10, 2),
	"half_kilo_stock" numeric(10, 2) DEFAULT '0' NOT NULL,
	"half_kilo_threshold" numeric(10, 2) DEFAULT '5' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"category_name_snapshot" varchar(160) DEFAULT '' NOT NULL,
	"unit_price_snapshot" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" varchar(32) DEFAULT 'kilo' NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_subtotal_check" CHECK ("order_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"customer_name" varchar(160) NOT NULL,
	"phone_number" varchar(32) NOT NULL,
	"pickup_date" date NOT NULL,
	"pickup_time" varchar(32) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"total_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deposit_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"remaining_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" varchar(32) DEFAULT 'cash' NOT NULL,
	"payment_status" varchar(32) DEFAULT 'unpaid' NOT NULL,
	"created_by" "order_created_by" DEFAULT 'guest' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_total_price_check" CHECK ("orders"."total_price" >= 0),
	CONSTRAINT "orders_deposit_amount_check" CHECK ("orders"."deposit_amount" >= 0),
	CONSTRAINT "orders_remaining_balance_check" CHECK ("orders"."remaining_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"email" varchar(160),
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"staff_access" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_category_id_idx" ON "order_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "order_items_cat_unit_idx" ON "order_items" USING btree ("category_id","unit");--> statement-breakpoint
CREATE INDEX "orders_pickup_date_idx" ON "orders" USING btree ("pickup_date");--> statement-breakpoint
CREATE INDEX "orders_phone_number_idx" ON "orders" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_pickup_date_idx" ON "orders" USING btree ("status","pickup_date");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");