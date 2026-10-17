# Feature Specification: Bulk Order Multi-Selection & Status Update

**Feature Name:** Bulk Order Status Update (`bulk-order-status-update`)  
**Target Screen:** `/admin/orders` (Orders Queue / قائمة الطلبات)  
**Author:** Pair Programming Agent & System Architect  
**Status:** Ready for Review & Implementation  
**Created Date:** 2026-10-17  

---

## 1. Goal & Value Proposition
Allow shop staff and administrators to select multiple customer orders simultaneously from the Orders Queue table (`/admin/orders`) and update their statuses in a single bulk operation (e.g. marking 10 orders as "Ready for Pickup" or "Collected" in one click), eliminating repetitive one-by-one status modifications during peak Eid rush hours.

---

## 2. Requirements & User Stories

### User Stories
1. **As an Admin/Baker:** When multiple batches of Eid sweets finish baking and packaging, I want to select all corresponding customer orders with checkboxes and mark them as "Ready for Pickup" (`جاهز للاستلام`) at once.
2. **As Counter Staff:** When several walk-in customers or pre-packed online pickups are collected during a rush, I want to select those orders and mark them as "Collected" (`تم الاستلام`) together.
3. **As an Operator:** I want a "Select All" option that selects all orders currently matching my search and timeframe filters, and a clear button to deselect all.
4. **As a Store Owner:** I want a safety confirmation dialog before bulk applying any status change to prevent accidental mass status changes.

### Key Functional Requirements
1. **Multi-Selection UI:**
   - **Row Checkbox:** Each row in the desktop and mobile views of `/admin/orders` has an independent checkbox.
   - **Header Master Checkbox:** Located in the table header. Checking it selects all currently displayed/filtered orders. If some (but not all) orders are selected, it displays in indeterminate state.
   - **Row Highlight:** Selected rows show a distinct subtle highlight (`bg-primary/5`) for clear visual feedback.
   - **Row Click Isolation:** Clicking the checkbox toggles selection without opening the Order Detail inspection drawer.

2. **Floating Bulk Action Bar:**
   - When $\ge 1$ order is selected, a floating action dock animates up at the bottom of the screen (`fixed bottom-6 left-1/2 -translate-x-1/2 z-50`).
   - Displays:
     - Count badge: e.g. "تم تحديد 4 طلبات" / "4 orders selected".
     - Deselect button ("إلغاء التحديد" / "Clear").
     - Quick Status Action Buttons:
       - **تم القبول** (`accepted`)
       - **في التجهيز** (`preparing`)
       - **جاهز للاستلام** (`ready`)
       - **تم الاستلام** (`delivered`)
       - **مرفوض** (`rejected`) (styled in warning/danger tone)

3. **Confirmation Dialog:**
   - Clicking any status action opens a modal:
     - Header: "تأكيد تغيير حالة الطلبات" (Confirm Bulk Status Update)
     - Content: "هل أنت متأكد من تغيير حالة **X طلب** إلى **[اسم الحالة]**؟"
     - If the target status is `rejected`: shows an explicit warning noting that sweet quantities in these orders will be refunded back to active inventory.
     - Actions: "تأكيد وتطبيق" (Confirm & Apply) with spinner, and "تراجع" (Cancel).

4. **Stock & Business Rules Integrity:**
   - Preserves existing system stock logic:
     - Creating orders reserves stock.
     - Transitioning to `rejected` restores items to inventory.
     - Transitioning to `delivered`, `ready`, `preparing`, or `accepted` updates order record state without double-deducting already reserved stock.
   - Updates `updatedAt` timestamps.

---

## 3. Architecture & Technical Design

### API Contract (`lib/api-spec/openapi.yaml`)
Add endpoint: `POST /orders/bulk-status`

```yaml
  /orders/bulk-status:
    post:
      operationId: bulkUpdateOrderStatus
      tags: [orders]
      summary: Bulk update status for multiple orders
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [orderIds, status]
              properties:
                orderIds:
                  type: array
                  items: { type: integer }
                  description: List of order IDs to update
                status:
                  $ref: "#/components/schemas/OrderStatus"
      responses:
        "200":
          description: Status updated successfully
          content:
            application/json:
              schema:
                type: object
                required: [success, updatedCount]
                properties:
                  success: { type: boolean }
                  updatedCount: { type: integer }
        "400":
          description: Invalid request payload
```

### Backend Implementation (`artifacts/api-server/src/routes/eid-sweets.ts`)
1. Implement route handler for `POST /orders/bulk-status`.
2. Validate payload with Zod (`orderIds: z.array(z.number()).min(1)`, `status: OrderStatus`).
3. Query all target orders from DB:
   - For any orders switching from non-rejected to `rejected`: calculate and restore item quantities to `categories.stockQuantity`.
   - For any orders switching from `rejected` to non-rejected: check and reserve stock.
4. Update `orders.status` and `orders.updatedAt` in database for all `orderIds` using `inArray(orders.id, orderIds)`.
5. Return `{ success: true, updatedCount }`.

### Frontend State & Components (`artifacts/eid-sweets-orders/src/App.tsx`)
1. **State:**
   - `selectedOrderIds: Set<number>`
   - `bulkTargetStatus: OrderStatus | null` (controls confirmation dialog)
   - `isBulkUpdating: boolean`
2. **Components:**
   - `Checkbox`: Accessible HTML checkbox with custom Tailwind styling.
   - `FloatingBulkActionBar`: Floating bottom container with count, clear button, and status trigger buttons.
   - `BulkStatusConfirmDialog`: Confirmation modal before executing bulk mutation.

---

## 4. Phased Implementation Plan

- **Phase 1: API Spec & Codegen**
  - Update `lib/api-spec/openapi.yaml` with `bulkUpdateOrderStatus`.
  - Run Orval codegen to generate TypeScript types, Zod schemas, and React Query hook `useBulkUpdateOrderStatus`.
- **Phase 2: Backend Implementation & Unit Testing**
  - Implement route handler in `artifacts/api-server/src/routes/eid-sweets.ts`.
  - Add unit tests in `artifacts/api-server/src/routes/eid-sweets.test.ts` verifying bulk updates, inventory safety, and count reporting.
  - Bundle serverless function (`api/index.js`).
- **Phase 3: Frontend UI & Multi-Selection Workflow**
  - Add translation keys for English and Arabic in `App.tsx`.
  - Add header checkbox, row checkboxes, selection highlight, and floating bulk action bar.
  - Add confirmation dialog with stock warning if rejecting.
  - Invalidate React Query caches (`orders`, `summary`, `analytics`) on success.
- **Phase 4: Verification & Delivery**
  - Run `pnpm run typecheck`.
  - Run `pnpm test`.
  - Build production client and server bundles.
  - Git commit & push.
