# Sold Items Analytics & Sales Breakdown Specification (تقرير إحصائيات مبيعات الأصناف)

## 1. Goal & Overview
Provide bakery owners, store managers, and accountants with an accurate, real-time sales breakdown that calculates the **exact amount of each sweet sold and delivered** (`did sold`), separated into true physical weights (Kilos and Half-Kilos), pre-packed boxes, and pieces, along with revenue and order counts.

This replaces the previous simplistic units-only counter with an audit-ready, filterable sales breakdown table in the Admin Analytics view (`/admin/analytics`), complemented by a quick "Today's Top Sold" widget on the main dashboard (`/admin`).

---

## 2. Target Audience & Permissions
- **Shop Owner & General Manager**: Analyze sweet popularity, revenue generation per sweet, and baking demand vs real sales.
- **Kitchen Chef & Production Supervisors**: Gauge daily consumption and exact kilogram weights sold to plan upcoming baking batches.
- **Cashier & Store Staff**: Monitor counter sales velocity and daily targets.
- **Access Guard**: Protected under the `analytics` staff permission and owner role.

---

## 3. Business Logic & Calculation Rules

### 3.1 Definition of "Sold" (`did sold`)
- To reflect actual physical sales and revenue honestly:
  - **Primary Filter (Default)**: Strictly delivered orders (`status = 'delivered'`), which encompasses all fulfilled pickup bookings and instant walk-in cashier POS orders.
  - **Secondary Filter Toggle**: Option to view "All Confirmed Orders" (`accepted`, `preparing`, `ready`, `delivered`) for kitchen demand forecasting.
  - **Excluded**: Cancelled/rejected orders (`status = 'rejected'`) are strictly excluded from sales counts.

### 3.2 Exact Weight & Unit Aggregation
Orders can contain items in different packaging units (`kilo`, `half_kilo`, `box`, `piece`). Sales must be aggregated intelligently without conflating 1 kg with 0.5 kg:
1. **Weighted Sweets (`unit = 'kilo'` or `half_kilo`)**:
   - `kilosSold`: Count of 1.0 kg packages sold.
   - `halfKilosSold`: Count of 0.5 kg packages sold.
   - `totalWeightKg`: Combined net weight in kilograms:
     $$\text{totalWeightKg} = (\text{kilosSold} \times 1.0) + (\text{halfKilosSold} \times 0.5)$$
2. **Pre-boxed Sweets (`unit = 'box'`)**:
   - `boxesSold`: Total count of boxes sold.
3. **Piece-based Sweets (`unit = 'piece'`)**:
   - `piecesSold`: Total count of individual pieces sold.
4. **Financial Revenue**:
   - `revenue`: Sum of `item.subtotal` for all matching items (in EGP).
   - `ordersCount`: Number of unique customer orders containing this sweet.
   - `revenueShare`: Percentage of this item's revenue relative to total sales in the selected period.

### 3.3 Time Periods & Timezone Normalization
- All date grouping and filtering uses Egypt Standard Time (`Africa/Cairo`).
- Supported filter presets:
  - **اليوم (Today)**: Orders with pickup/creation on the current Cairo calendar date.
  - **هذا الأسبوع (This Week)**: Past 7 days rolling window.
  - **هذا الشهر (This Month)**: Past 30 days rolling window.
  - **طوال الموسم (All Season)**: Complete lifetime order history.
  - **تاريخ محدد (Custom Date)**: Single specific date selected via date-picker.

---

## 4. User Interface & Screen Design

### 4.1 Enhanced Analytics Page (`/admin/analytics`)
1. **Timeframe Selector Toolbar**:
   - Segmented buttons: `طوال الموسم (All)` | `اليوم (Today)` | `هذا الأسبوع (Week)` | `هذا الشهر (Month)` | Date Input.
   - Status Mode Toggle: `المبيعات المستلمة فعلياً (Delivered Only)` vs `شامل الحجوزات المؤكدة (All Confirmed)`.
2. **Summary KPI Metrics Banner**:
   - **إجمالي الدخل المحقق (Delivered Revenue)**: EGP total.
   - **إجمالي الوزن المباع (Total Weight Sold)**: Total kilograms across all weighted sweets.
   - **إجمالي العلب المسلّمة (Total Boxes Sold)**: Count of boxed sweets.
   - **عدد العمليات والفواتير (Delivered Invoices)**: Number of completed orders.
3. **Interactive Sold Items Breakdown Table (جدول تفصيلي للأصناف المباعة)**:
   - Search bar: Filter sweets by name on the fly.
   - Columns:
     - **الصنف (Sweet)**: Thumbnail image + Arabic & English name + unit badge.
     - **الكميات المباعة بالتفصيل (Amounts Sold)**:
       - For weighted items: Badges showing `X كجم` + `Y نصف كجم` with bold highlighted total: `المجموع: Z كجم`.
       - For boxed items: `N علبة`.
     - **عدد الطلبات (Orders)**: Number of orders that included this sweet.
     - **إجمالي الإيراد (Revenue)**: Formatted currency (`money.format(revenue)`).
     - **الحصة البيعية (Sales Share)**: Percentage bar showing proportion of overall revenue.
   - Action Button: **[📥 تصدير التقرير (CSV)]** to download the table directly into Excel/Sheets.
4. **Existing Charts Preserved**:
   - 7-Day sales volume bar chart.
   - Eid countdown widget.

### 4.2 Dashboard Overview Widget (`/admin`)
- Located in `AdminOverview`:
- A clean, high-visibility card: **"الأكثر مبيعاً اليوم" (Today's Top Sold)**:
  - Displays top 3–4 best-selling sweets today with total weight/boxes and revenue.
  - Clickable shortcut: `عرض التقرير التفصيلي ←` navigating directly to `/admin/analytics`.

---

## 5. Technical Architecture & Data Contracts

### 5.1 OpenAPI Specification Updates (`lib/api-spec/openapi.yaml`)
- Add query parameters to `GET /dashboard/analytics`:
  - `timeframe`: string (`today`, `week`, `month`, `all`, `custom`)
  - `date`: string (ISO date `YYYY-MM-DD`)
  - `statusMode`: string (`delivered`, `confirmed`)
- Extend `CategoryTotal` schema:
  ```yaml
  CategoryTotal:
    type: object
    required: [categoryName, quantity, revenue]
    properties:
      categoryId: { type: integer }
      categoryName: { type: string }
      imageUrl: { type: string }
      unit: { type: string }
      quantity: { type: number }
      revenue: { type: number }
      totalWeightKg: { type: number }
      kilosSold: { type: number }
      halfKilosSold: { type: number }
      boxesSold: { type: number }
      piecesSold: { type: number }
      ordersCount: { type: integer }
      revenueShare: { type: number }
  ```
- Add optional `analyticsSummary` object to `DashboardAnalytics`:
  ```yaml
  analyticsSummary:
    type: object
    properties:
      totalRevenue: { type: number }
      totalWeightKg: { type: number }
      totalBoxes: { type: number }
      totalOrders: { type: integer }
  ```

### 5.2 Server Aggregation Logic (`artifacts/api-server/src/routes/eid-sweets.ts`)
- In `GET /dashboard/analytics`:
  - Read query filters: `timeframe`, `date`, `statusMode`.
  - Filter orders list:
    - If `statusMode === 'confirmed'`: include `['accepted', 'preparing', 'ready', 'delivered']`.
    - Otherwise (default): strictly include `order.status === 'delivered'`.
    - Apply Cairo local date boundary filters matching `order.pickupDate` or `order.createdAt`.
  - Traverse `order.items`:
    - Track counts for `unit === 'kilo'`, `unit === 'half_kilo'`, `unit === 'box'`, and `unit === 'piece'`.
    - Calculate net weight: `(kilos * 1.0) + (halfKilos * 0.5)`.
    - Track distinct order IDs per category for `ordersCount`.
    - Sort output descending by `totalWeightKg` or `revenue`.

---

## 6. Phased Implementation Plan

### Phase 1: Contracts & Backend API
1. Update `lib/api-spec/openapi.yaml` with extended `CategoryTotal` properties and filter query parameters.
2. Run code generation (`pnpm --filter @workspace/api-spec run build`, `api-zod`, `api-client-react`).
3. Update `GET /dashboard/analytics` in `artifacts/api-server/src/routes/eid-sweets.ts`:
   - Implement accurate weight calculation and status filtering.
   - Add unit tests verifying calculation for 1kg, 0.5kg, and boxes under different status modes.
4. Run `node ./build.mjs` to bundle `api/index.js`.

### Phase 2: Frontend Analytics Dashboard
1. Add translation keys to `en` and `ar` dictionaries in `artifacts/eid-sweets-orders/src/App.tsx`:
   - `soldBreakdown`, `totalWeightSold`, `exactKilos`, `exactHalfKilos`, `salesShare`, `exportReportCsv`, `deliveredOnlyFilter`, `allConfirmedFilter`, `todayTopSold`, `viewFullReport`.
2. Enhance `AnalyticsPage` in `App.tsx`:
   - Add Timeframe & Status Mode toolbar.
   - Add KPI summary stat cards (revenue, total weight, total boxes, invoices).
   - Implement the interactive `SoldItemsTable` with thumbnail images, quantity pills, revenue, progress bar, and CSV export.

### Phase 3: Dashboard Overview Integration
1. Add the "الأكثر مبيعاً اليوم" (Today's Top Sold) compact widget to `AdminOverview`.
2. Connect navigation link to `/admin/analytics?timeframe=today`.

### Phase 4: Verification & Build
1. Run `pnpm run typecheck` across all workspace projects.
2. Run `pnpm test` for backend test coverage.
3. Run `pnpm run build` to package frontend and serverless outputs.
4. Commit and push changes to `main`.
