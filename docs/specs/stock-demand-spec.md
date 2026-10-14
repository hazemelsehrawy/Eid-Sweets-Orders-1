# Stock & Demand Balance Specification (ميزان المخزون والطلبيات)

## 1. Goal & Overview
Provide store managers and kitchen staff with an intuitive, real-time comparison dashboard that matches **actual physical warehouse stock** against **reserved demand from active customer orders**. This allows staff to immediately spot production deficits (كميات العجز المطلوب خبيزها), re-stock finished baking batches on the fly, and inspect the exact customer orders waiting on each sweet.

---

## 2. Target Audience & Permissions
- **Shop Owner & Admin**: Full oversight of stock balances, order allocations, and immediate restock capabilities.
- **Kitchen & Packing Staff**: Understand how many kilograms / half-kilograms of each sweet need to be baked and boxed for today's and upcoming pickup slots.
- **Permission Guard**: Accessible to staff accounts with either `inventory` or `orders` permission.

---

## 3. Scope & Filtering Rules
- **Order Inclusion Criteria**:
  - Unfulfilled active orders: statuses `pending`, `accepted`, and `preparing`.
  - Excluded from demand: `rejected` / `cancelled` (restocked) and `delivered` (already collected by customer).
- **Date Filtering Options**:
  - **All Active** (default): All pending and in-progress orders regardless of date.
  - **Today's Pickups**: Only orders scheduled for pickup on Cairo local time today.
  - **Tomorrow's Pickups**: Orders scheduled for tomorrow's production prep.
  - **Specific Date**: Filter by custom pickup date.
- **Unit Separation**:
  - Demand and stocks are partitioned strictly into **1 kg** and **0.5 kg** (matching the new separated stock architecture in the database).

---

## 4. UI Layout & Component Design

### 4.1 Route & Navigation
- **URL**: `/admin/stock-demand`
- **Navigation Item**: Added to the main Admin top header / sidebar:
  - Label: `ميزان المخزون والطلبيات` (AR) / `Stock vs Demand` (EN)
  - Icon: `Scale` / `BarChart3` (Lucide)

### 4.2 Top Summary KPI Cards
1. **Critical Deficit Count (أصناف بها عجز)**: Badge indicating how many sweets have active demand exceeding available stock.
2. **Active Orders Monitored (إجمالي الطلبات النشطة)**: Total count of active orders being aggregated.
3. **Total Kilos Demanded (إجمالي الكيلوجرامات المطلوبة)**: Sum of all 1 kg sweet orders.
4. **Total Half-Kilos Demanded (إجمالي أنصاف الكيلو المطلوبة)**: Sum of all 0.5 kg sweet orders.

### 4.3 Filter & Quick-Action Bar
- Search box for sweet name.
- Segmented date filter buttons (`All Active`, `Today`, `Tomorrow`, Custom Date).
- Filter toggle: `Show Deficits Only (الأصناف التي بها عجز فقط)` vs `All Sweets (كل الأصناف)`.

### 4.4 Sweet Balance Cards / Table
Each sweet displays:
- Image thumbnail and Arabic/English title.
- **1 kg Card Panel**:
  - `مخزون الكيلو (Stock)`: Current available 1 kg units.
  - `مطلوب في الطلبيات (Demand)`: Sum of 1 kg items in active orders.
  - `الميزان (Net Balance)`:
    - **Deficit (عجز)**: Red highlighted badge `🚨 عجز: مطلوب خبيز X كجم`.
    - **Surplus (فائض)**: Green badge `✅ متوفر: X كجم فائض`.
  - Action 1: **[+ إضافة إنتاج]** quick inline restock button (adds input quantity to `stockQuantity` via `PATCH /categories/:id`).
  - Action 2: **[📋 عرض X طلب]** drill-down button to see contributing orders.
- **0.5 kg Card Panel**:
  - Same metrics for `halfKiloStock` vs `halfKiloDemand`.
  - Action 1: **[+ إضافة إنتاج]** quick restock button for half-kilo stock.
  - Action 2: **[📋 عرض X طلب]** drill-down button.

### 4.5 Order Drill-Down Drawer (Modal/Slide-over)
When the user clicks the drill-down button for any sweet and unit:
- Displays a dedicated drawer listing each customer order containing that item:
  - Order Number (`#EID-xxxx`)
  - Customer Name & Mobile number (with WhatsApp click-to-chat button)
  - Pickup Date & Scheduled Pickup Time slot
  - Quantity of the selected sweet unit in that order
  - Order status badge (`pending`, `accepted`, `preparing`)
  - Direct button to navigate to the order in the Counter Queue.

---

## 5. Technical Architecture & Data Flow

### 5.1 Real-Time Reactive Calculation (Approach 1)
```
[ useListCategories() ]  ───┐
                            ├──> useMemo() Aggregator ───> [ Stock & Demand UI ]
[ useListOrders() ]      ───┘         │
                                      ▼
                        - kiloDemand = sum(items where unit == 'kilo')
                        - halfKiloDemand = sum(items where unit == 'half_kilo')
                        - kiloBalance = stockQuantity - kiloDemand
                        - halfKiloBalance = halfKiloStock - halfKiloDemand
```

### 5.2 Stock Quick-Adjust Mutation
- When staff clicks **[+ إضافة إنتاج]**:
  - Triggers existing `PATCH /categories/:categoryId` with updated `stockQuantity` or `halfKiloStock`.
  - Invalidates TanStack Query cache for categories (`getGetDashboardSummaryQueryKey`, `getListCategoriesQueryKey`).
  - Instantly recalculates balance without page reload.

---

## 6. Phased Implementation Plan
- **Phase 1**: Add translation keys for Stock & Demand in `App.tsx` (AR/EN).
- **Phase 2**: Add `/admin/stock-demand` route, navigation link in admin header/sidebar, and permission guards.
- **Phase 3**: Implement `StockDemandPage` component with KPI summary cards, date filter bar, and balance cards.
- **Phase 4**: Implement inline quick-restock modal/popover to increment stock immediately.
- **Phase 5**: Implement the drill-down drawer showing contributing customer orders.
- **Phase 6**: Verification with typecheck, tests, and build.
