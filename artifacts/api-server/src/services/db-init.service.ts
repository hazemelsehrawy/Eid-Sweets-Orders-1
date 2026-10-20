import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schemaEnsured = false;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaEnsured || !process.env.DATABASE_URL) return;

  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE category_unit AS ENUM ('kilo', 'half_kilo', 'box', 'piece');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        ALTER TYPE category_unit ADD VALUE IF NOT EXISTS 'half_kilo';
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
        half_kilo_price numeric(10, 2),
        half_kilo_stock numeric(10, 2) NOT NULL DEFAULT '0',
        half_kilo_threshold numeric(10, 2) NOT NULL DEFAULT '5',
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
        category_name_snapshot varchar(160) NOT NULL DEFAULT '',
        unit_price_snapshot numeric(10, 2) NOT NULL DEFAULT '0',
        unit varchar(32) NOT NULL DEFAULT 'kilo',
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
        ADD COLUMN IF NOT EXISTS half_kilo_price numeric(10, 2),
        ADD COLUMN IF NOT EXISTS half_kilo_stock numeric(10, 2) NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS half_kilo_threshold numeric(10, 2) NOT NULL DEFAULT '5',
        ADD COLUMN IF NOT EXISTS image_url text,
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

      ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS category_name_snapshot varchar(160) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(10, 2) NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS unit varchar(32) NOT NULL DEFAULT 'kilo';

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
      CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
      CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
      CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
    `);
    schemaEnsured = true;
  } catch (err) {
    console.warn("ensureDatabaseSchema warning:", (err as Error).message);
  }
}
