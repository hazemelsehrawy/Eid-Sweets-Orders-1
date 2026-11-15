# WhatsApp Customer Broadcast Campaigns & Offers Specification

**Project:** Eid Sweets Orders & Cashier POS  
**Module:** WhatsApp Marketing & Customer Broadcast Dispatcher  
**Status:** Approved Specification  
**Version:** 1.0.0  

---

## 1. Goal & Value Proposition

The **WhatsApp Broadcast Campaigns & Offers** module empowers store owners and staff to send personalized promotional messages, new sweet releases, Eid discounts, and booking reminders to all existing customers via WhatsApp.

### Key Objectives:
1. **100% Free & Anti-Ban:** Utilizes standard client-side `wa.me` links with user-confirmed dispatch, completely bypassing the risks of WhatsApp account bans associated with bulk spam bots, while avoiding costly Meta Cloud API fees.
2. **Dynamic Personalization:** Automatically substitutes customer variables (e.g., `{الاسم}` with the customer's actual name and `{الرابط}` with the store's public web URL) to enhance response rates.
3. **Smart Deduplicated Customer Directory:** Automatically extracts all unique past customers from order history, grouped and normalized by phone number.
4. **Session Progress & State Tracking:** Tracks sent vs. pending customers visually (✅ Sent / ⏳ Pending) with persistence in browser `localStorage`, preventing duplicate messages even if the page refreshes.
5. **Sequential One-Click Dispatcher:** Features an intuitive "Send Next Customer" button that opens the targeted WhatsApp conversation with the pre-filled message, marks the customer as sent, and advances to the next customer in the queue.

---

## 2. Features & Functional Requirements

### 2.1 Backend: Unique Customers Extraction API
* **Endpoint:** `GET /customers`
* **Access Control:** Requires admin/staff authentication with `orders` or `analytics` permission (`requirePermission(["orders", "analytics"])`).
* **Data Aggregation:**
  * Groups orders by `phone_number`.
  * Extracts the most recent `customer_name`.
  * Calculates `total_orders` count per customer.
  * Calculates `total_spent` (sum of order totals).
  * Retrieves `last_order_date` (`MAX(created_at)`).
  * Sorts by `last_order_date DESC` so the most active and recent customers appear first.
* **Fallback Mode:** Provides exact parity in local in-memory fallback mode when `DATABASE_URL` is unconfigured.

### 2.2 Frontend: WhatsApp Broadcast Modal Component
* **Access Point:** Header toolbar in the Admin View (`OrdersPage`), labeled **"📢 عروض واتساب"** (EN: **"📢 WhatsApp Offers"**).
* **Message Composer:**
  * Rich multi-line text input with character counter.
  * Tag Insertion Pills:
    * `🏷️ {الاسم}`: Inserts customer's full name.
    * `🔗 {الرابط}`: Inserts the store's direct URL (`window.location.origin`).
    * `📞 {الهاتف}`: Inserts customer's phone number.
  * Pre-defined Egyptian Sweets Templates:
    1. **خصم العيد (Eid Special Discount):** Greeting with customer name, store discounts, and order link.
    2. **أصناف جديدة (New Menu Items):** Announcement of fresh batches of Kahk, Ghorayeba, and Petit Four.
    3. **تذكير بالحجز المبكر (Early Reservation Reminder):** Urging customers to lock in their pickup time slots before capacity runs out.
* **Live WhatsApp Bubble Preview:**
  * Visual chat bubble matching WhatsApp's green theme (`#DCF8C6` / dark theme `#005C4B`).
  * Real-time preview with dynamic variable replacement using a sample customer's name.
* **Sequential Dispatch Engine:**
  * Progress indicator: `تم إرسال: X / Y عميل (Z%)`.
  * Large Primary Action Button: `📲 إرسال للعميل التالي: [اسم العميل - رقم الهاتف]`.
  * Normalizes Egyptian phone numbers into WhatsApp international format:
    * Strips non-digit characters.
    * Prefixes standard Egyptian numbers (`010...`, `011...`, `012...`, `015...`) with country code `20` (`2010...`).
  * Generates direct link: `https://wa.me/<normalized_phone>?text=<encoded_message>`.
  * Automatically marks the customer as sent upon click, saves the ID in `localStorage`, and queues the next customer.
* **Customer Queue Table:**
  * Search bar (filter by customer name or phone number).
  * Status badges (`قيد الانتظار ⏳` vs `تم الإرسال ✅`).
  * Individual direct action button (`إرسال 💬`) to skip queue or message any customer directly.
  * "إعادة تعيين الحملة (Reset Campaign)" button to clear sent status flags for a brand-new campaign.

---

## 3. Data Model & Specifications

### 3.1 Customer Directory DTO
```typescript
export interface CustomerSummary {
  phoneNumber: string;       // e.g. "01012345678"
  normalizedPhone: string;   // e.g. "201012345678"
  customerName: string;      // e.g. "سارة محمود"
  totalOrders: number;       // e.g. 3
  totalSpent: number;        // e.g. 740.00
  lastOrderDate: string;     // ISO timestamp string
}
```

### 3.2 SQL Aggregation Query
```sql
SELECT 
  phone_number AS "phoneNumber",
  MAX(customer_name) AS "customerName",
  COUNT(id)::int AS "totalOrders",
  COALESCE(SUM(total_price::numeric), 0)::float AS "totalSpent",
  MAX(created_at) AS "lastOrderDate"
FROM orders
WHERE phone_number IS NOT NULL AND TRIM(phone_number) != ''
GROUP BY phone_number
ORDER BY MAX(created_at) DESC;
```

---

## 4. Egyptian WhatsApp Phone Normalizer Specification

```typescript
export function normalizeWhatsAppNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/\D/g, "");
  
  // Standard Egyptian mobile numbers (010, 011, 012, 015)
  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return `20${cleaned.slice(1)}`;
  }
  // Egyptian numbers already starting with 201...
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  // Generic fallback if already international
  return cleaned;
}
```

---

## 5. User Interface & Screen Layout

### 5.1 Modal Hierarchy & Wireframe
```
┌────────────────────────────────────────────────────────────────────────┐
│  📢 حملات وعروض واتساب للعملاء                                     [X] │
├────────────────────────────────────────────────────────────────────────┤
│  [ القوالب الجاهزة: (عرض العيد) (أصناف جديدة) (تذكير بالحجز) ]          │
│                                                                        │
│  محتوى الرسالة:                                                       │
│  [+ اسم العميل {الاسم}]  [+ رابط المتجر {الرابط}]  [+ الهاتف {الهاتف}] │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ أهلاً {الاسم} 👋 بمناسبة حلول عيد الفطر المبارك...               │  │
│  │ اطلب الآن عبر موقعنا: {الرابط}                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  معاينة الرسالة:                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 💬 أهلاً أحمد محمود 👋 بمناسبة حلول عيد الفطر...         10:30 ص ✔✔ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  نسبة الإنجاز: [████████████░░░░░░░░░░░░░░░░] 24 / 96 عميل (25%)        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │    📲 إرسال للعميل التالي: [ سارة محمود - 01098765432 ]          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  قائمة العملاء (96 عميل فريد):                [ 🔍 بحث بالاسم أو الرقم]│
│  ────────────────────────────────────────────────────────────────────  │
│  • سارة محمود       01098765432   (3 طلبات)         [ ⏳ إرسال الآن ]  │
│  • كريم إبراهيم     01123456789   (طلب واحد)        [ تم الإرسال ✅ ]  │
│  • منى عبد الله     01234567890   (5 طلبات)         [ ⏳ إرسال الآن ]  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Phased Implementation Roadmap

1. **Phase 1: Backend Customer Extraction API (`GET /customers`)**
   - Implement database aggregation query in `artifacts/api-server/src/routes/eid-sweets.ts`.
   - Add in-memory fallback customer aggregation for offline development.
   - Author automated unit test in `eid-sweets.test.ts`.

2. **Phase 2: Phone Normalization & WhatsApp Link Helper Utilities**
   - Implement `normalizeWhatsAppNumber(phone)` and `buildWhatsAppShareUrl(phone, template, params)`.
   - Unit test all Egyptian mobile prefixes (`010`, `011`, `012`, `015`, international `+201...`).

3. **Phase 3: Frontend `WhatsAppBroadcastModal` Component**
   - Create `WhatsAppBroadcastModal.tsx` in `artifacts/eid-sweets-orders/src/components/marketing/`.
   - Implement template selection, variable tag pills, character count, and live WhatsApp bubble preview.
   - Implement progress tracking with `localStorage` persistence.

4. **Phase 4: Admin Header Integration & Verification**
   - Add `button-open-whatsapp-broadcast` to the admin toolbar.
   - Verify responsive display on Mobile, Tablet, and Desktop.
   - Run typecheck (`pnpm run typecheck`), automated tests (`pnpm test`), and production build (`pnpm run build`).
