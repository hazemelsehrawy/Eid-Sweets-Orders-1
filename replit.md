# Saffron & Seed Eid Orders

Saffron & Seed is a responsive guest ordering and shop operations app for Eid sweets and biscuit pickup orders.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/eid-sweets-orders/` — React/Vite guest ordering flow, Clerk sign-in, admin dashboard, inventory, analytics, and tracking pages.
- `artifacts/api-server/src/routes/eid-sweets.ts` — API handlers for categories, orders, tracking, dashboard summaries, analytics, and CSV export.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod contracts.
- `lib/db/src/schema/eid-sweets.ts` — Drizzle schema for categories, orders, and order items.

## Architecture decisions

- Guest order creation, category browsing, and order tracking are public; all operations and dashboard endpoints require Clerk authentication.
- Browser authentication uses Clerk's same-origin session cookies; no bearer-token handling or local password auth is used.
- Order pickup dates are calendar dates, while order creation timestamps use timezone-aware timestamps.
- Category deletion is a soft hide (`isActive = false`) so historical order items remain intact.
- The API returns numeric prices and quantities even though PostgreSQL stores precise decimals as numeric strings.

## Product

Guests can build a sweets box, choose a pickup slot, place an order, and track it by order number or phone. Staff can sign in, process orders through pickup stages, manage categories and low-stock thresholds, review analytics, and export order CSVs.

## User preferences

- The first version intentionally ships without online payments or WhatsApp integration; the product structure can support them later.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Admin API calls return 401 until the browser has an active Clerk session.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
