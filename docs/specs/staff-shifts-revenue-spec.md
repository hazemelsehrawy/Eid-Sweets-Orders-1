# Staff Shifts & Per-Employee Delivered Revenue Specification

## 1. Goal & Scope
Enable **Fatouh Sweets (`حلويات فتوح`)** to track **Delivered Revenue per staff member** across work shifts, give employees a one-click **Start Shift / End Shift** workflow right after signing in, surface live & completed shift revenue on the **Owner's Admin Dashboard**, and provide an **Owner-only Employee Profile** with a day-by-day Delivered Revenue history and a **72mm thermal Z-Report print button** for every day.

### Confirmed Product Decisions
- **Revenue Attribution:** Exact per-employee attribution — counts POS sales (`status = 'delivered'`) created by the employee and any order the employee marks as **Delivered (`تم الاستلام`)** during their shift. Supports multiple employees working simultaneously on different devices.
- **Shift Enforcement:** Soft reminder — after sign-in, staff see a clear **Start Shift** button/banner without hard-blocking urgent counter orders. If an employee delivers an order without an active shift, `delivered_by_user_id` and `delivered_at` are still stamped (`shift_id = null`) so no revenue is lost.
- **Print Format:** **72mm thermal counter slip (Z-Report)** matching the existing 72mm receipt printer, including employee name, date, shift start/end times, delivered orders count, payment method breakdown (Cash / InstaPay / Vodafone Cash / Card), total Delivered Revenue, and handover signature lines.
- **Access Control:** **Owner only** can view employee profiles, all-staff shift summaries, and historical daily revenue reports. Regular staff can only start/end their own shift and view their own **active shift** live summary.
- **Technical Approach:** Dedicated `staff_shifts` table + order attribution columns (`delivered_by_user_id`, `delivered_at`, `shift_id`) + **frozen handover snapshot** persisted when a shift ends.

---

## 2. Data Model
- **`staff_shifts`:** `id`, `user_id` (`varchar(64)`), `shift_date` (`date`), `started_at`, `ended_at`, `status` (`active` / `closed`), frozen handover snapshot columns (`delivered_orders_count`, `delivered_revenue`, `cash_total`, `instapay_total`, `vodafone_cash_total`, `card_total`, `notes`), `created_at`.
- **`orders` additions:** `delivered_by_user_id` (`varchar(64)`), `delivered_at` (`timestamptz`), `shift_id` (`integer` FK → `staff_shifts.id` `ON DELETE SET NULL`).

## 3. API Endpoints
- `GET /api/shifts/me` — authenticated staff/owner active shift with live totals & payment breakdown.
- `POST /api/shifts/start` — starts an active shift (`201`, or `409` if already active).
- `POST /api/shifts/end` — freezes totals + optional `notes` onto the shift record (`200`, or `404`).
- `GET /api/shifts/overview` — **Owner only** (`requireOwner`) today's active & closed shifts across employees.
- `GET /api/staff/users/:userId/revenue-profile` — **Owner only** (`requireOwner`) employee KPIs + daily grouped Delivered Revenue breakdown (`timeframe` & `date` filters).

## 4. UI Components & Routes
- `ShiftControlBar` (`ShiftHeaderButton`, `ShiftReminderBanner`): Start Shift, active shift live pill, handover modal, End Shift confirmation.
- `AdminOverview` Owner widget: Today's Staff Shifts & Revenue card linking to `/admin/team/:userId`.
- `TeamPage`: Revenue Profile button on every employee card.
- `/admin/team/:userId` (`EmployeeRevenueProfilePage`, Owner only): Period KPIs, date/timeframe filters, daily revenue table, per-day 72mm Z-Report print (`PrintableEmployeeDailyReport`).
