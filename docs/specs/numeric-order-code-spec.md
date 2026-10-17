# Feature Specification: 5-Digit Numeric Customer Order Code

**Feature Name:** 5-Digit Numeric Order Code (`numeric-order-code`)  
**Target Areas:** Backend Order Generator, Customer Confirmation, Receipt Printout, Tracking Lookup, Orders Queue  
**Author:** Pair Programming Agent & System Architect  
**Status:** Ready for Review & Implementation  
**Created Date:** 2026-10-17  

---

## 1. Goal & Value Proposition
Replace long, hard-to-read alphanumeric order codes (e.g., `EID-MVBAH9KN-6082`) with simple **5-digit pure numeric codes** (e.g., `83921`, `10425`). This makes order numbers effortless for customers to memorize, read over phone calls, and communicate at the shop counter, while guaranteeing zero collisions and smooth auto-expansion to 6+ digits if the order volume exceeds the 5-digit capacity.

---

## 2. Requirements & User Stories

### User Stories
1. **As an Egyptian Sweet Shop Customer:** When I complete an order online or at the counter, I want a short 5-digit number like `83921` that I can easily remember and tell the cashier at pickup time.
2. **As Cashier / Counter Staff:** When a customer approaches the pickup counter and says "My order is 83921", I want to quickly type `83921` into the search box and pull up their order in 1 second.
3. **As a Store Owner:** If our shop manages more than 90,000 orders over time, the system must never throw errors, freeze, or fail; it should seamlessly expand to 6 digits without any disruption.
4. **As an Existing Customer:** If I placed an order yesterday with an older code like `EID-MVBAH9KN-6082`, I can still track and search for my order using my old code or phone number.

### Key Functional Requirements
1. **Random 5-Digit Generation Algorithm:**
   - Default format: pure numeric 5-digit string formatted between `10000` and `99999` (e.g. `83921`).
   - Generation logic:
     - Generate a random integer within `[10000, 99999]`.
     - Check database for uniqueness against existing `orders.orderNumber`.
     - Attempt up to 5 fast retries if a collision occurs.
   - **Saturation & Overflow Protection (Exceeding 5-digit capacity):**
     - If collision retries exceed 5 attempts, or if 5-digit space is saturated ($N \ge 85,000$), the generator automatically expands the digit length to 6 digits (`[100000, 999999]`).
     - If 6-digit space is saturated, it expands to 7 digits.
     - Database uniqueness constraint (`UNIQUE(order_number)`) ensures zero duplicates.
2. **Backward Compatibility:**
   - Existing orders retain their historical order numbers (`EID-XXXX-XXXX`).
   - Tracking lookup (`/track`) and queue search (`/admin/orders`) seamlessly accept both:
     - 5-digit numeric codes (e.g. `83921`).
     - 6+ digit expanded numeric codes (e.g. `104829`).
     - Historical alphanumeric codes (e.g. `EID-MVBAH9KN-6082`).
3. **Customer & Staff Touchpoints:**
   - **Customer Confirmation Modal & Receipt Page:** Highlights `#83921` in large, high-contrast monospace font.
   - **Thermal Receipt (72mm):** Prints `#83921` prominently in the receipt header and barcode/QR section.
   - **WhatsApp Messages:** Pre-composed message text displays `#83921`.
   - **Orders Queue Table:** Displays `#83921` under customer name.
   - **Track Search Input:** Search placeholder updated: `رقم الطلب (مثال: 83921) أو رقم الموبايل`.

---

## 3. Architecture & Technical Design

### Backend Implementation (`artifacts/api-server/src/routes/eid-sweets.ts`)

Create a helper function `generateUniqueOrderNumber(dbInstance?: any)`:

```ts
async function generateUniqueOrderNumber(): Promise<string> {
  const maxAttemptsPerLength = 5;
  let min = 10000;
  let max = 99999;

  while (true) {
    for (let attempt = 0; attempt < maxAttemptsPerLength; attempt++) {
      const candidate = String(Math.floor(min + Math.random() * (max - min + 1)));

      if (process.env.DATABASE_URL) {
        const [existing] = await db
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(eq(ordersTable.orderNumber, candidate))
          .limit(1);

        if (!existing) {
          return candidate;
        }
      } else {
        const existing = fallbackOrders.some((o) => o.orderNumber === candidate);
        if (!existing) {
          return candidate;
        }
      }
    }

    // If 5 attempts collided, dynamically expand to next digit length (5 -> 6 -> 7...)
    min = min * 10;
    max = max * 10 + 9;
  }
}
```

### Database Safety
- `ordersTable.orderNumber` is `varchar("order_number", { length: 32 }).notNull().unique()`.
- Numeric strings (`"83921"`) fit cleanly within `varchar(32)` without any schema migration needed.
- If an unexpected duplicate collision occurs simultaneously during concurrent transactions, PostgreSQL unique constraint catches it, and the transaction safely rolls back and retries.

### Frontend Presentation (`artifacts/eid-sweets-orders/src/App.tsx`)
1. Update `OrderConfirmationDialog` to display 5-digit number prominently.
2. Update `PrintableReceipt` to render clean numeric code.
3. Update `OrdersPage` and `AdminOverview` order rows.
4. Update `getWhatsAppLink` to format `#` with the numeric code.
5. Update search placeholders in English and Arabic:
   - Arabic: `ابحث بالاسم أو رقم الطلب (مثال: 83921) أو الموبايل`
   - English: `Search by name, order number (e.g. 83921), or mobile`

---

## 4. Phased Implementation Plan

- **Phase 1: Backend Number Generator & Unit Tests**
  - Implement `generateUniqueOrderNumber` with collision check & dynamic digit expansion.
  - Update `POST /orders` (both normal and quick POS) to use the new generator.
  - Add comprehensive unit tests in `eid-sweets.test.ts` verifying:
    - 5-digit number format (all numeric, length 5).
    - Uniqueness across multiple generated orders.
    - Automatic expansion to 6 digits when 5-digit attempts collide.
  - Rebuild serverless bundle (`node ./build.mjs`).
- **Phase 2: Frontend Touchpoints & UI Refinements**
  - Update search placeholders in Arabic and English.
  - Verify receipt, order detail, tracking modal, and WhatsApp message templates.
- **Phase 3: Verification & Delivery**
  - Run `pnpm run typecheck` (0 errors across all 9 workspaces).
  - Run `pnpm test` (verify all Vitest suites pass).
  - Run `pnpm run build` (verify production client & serverless bundle).
  - Git commit & push to GitHub `main`.
