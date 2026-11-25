import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import {
  ADMIN_INITIAL_PASSWORD,
  createSessionToken,
  fallbackUsers,
  hashPassword,
  normalizeWhatsAppNumber,
} from "./eid-sweets";

describe("API HTTP Integration Tests (Supertest)", () => {
  it("GET /categories - should return list of available sweet categories", async () => {
    const res = await request(app).get("/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("pricePerUnit");
    expect(res.body[0]).toHaveProperty("availableStock");
  });

  it("FIN-01: POST /orders - unauthenticated guest cannot tamper with depositAmount or paymentStatus", async () => {
    const maliciousOrder = {
      customerName: "عميل مخترق",
      phoneNumber: "01012345678",
      pickupDate: "2026-04-15",
      pickupTime: "11:00",
      items: [{ categoryId: 1, quantity: 2, unit: "kilo" }],
      depositAmount: 500, // Malicious override
      paymentStatus: "paid", // Malicious override
      createdBy: "guest",
    };

    const res = await request(app).post("/orders").send(maliciousOrder);
    expect(res.status).toBe(201);
    // FIN-01 verified: guest deposit forced to 0, payment status forced to unpaid
    expect(res.body.depositAmount).toBe(0);
    expect(res.body.paymentStatus).toBe("unpaid");
    expect(res.body.remainingBalance).toBe(res.body.totalPrice);
  });

  it("FIN-02: POST /orders - disallows unit: half_kilo on items sold as box or piece", async () => {
    // Category 3 is "بيتي فور مشكل فاخر" with unit: "box"
    const invalidUnitOrder = {
      customerName: "أحمد علي",
      phoneNumber: "01099887766",
      pickupDate: "2026-04-15",
      pickupTime: "12:00",
      items: [{ categoryId: 3, quantity: 1, unit: "half_kilo" }],
      createdBy: "guest",
    };

    const res = await request(app).post("/orders").send(invalidUnitOrder);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("نصف كيلو");
  });

  it("IDOR-01 & IDOR-02: GET /orders/track - enforces orderNumber + phone and masks customer PII", async () => {
    // 1. First place a valid order
    const orderRes = await request(app).post("/orders").send({
      customerName: "سارة محمود",
      phoneNumber: "01098765432",
      pickupDate: "2026-04-16",
      pickupTime: "14:00",
      notes: "ملاحظات سرية للطلب",
      items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      createdBy: "guest",
    });

    const orderNumber = orderRes.body.orderNumber;
    expect(orderNumber).toBeDefined();

    // 2. Reject tracking with empty query
    const emptyRes = await request(app).get("/orders/track");
    expect(emptyRes.status).toBe(400);

    // 3. Reject tracking with short phone (< 10 digits)
    const shortPhoneRes = await request(app).get("/orders/track?phone=123");
    expect(shortPhoneRes.status).toBe(400);

    // 4. Tracking by orderNumber succeeds and PII is masked (IDOR-02)
    const trackByOrderRes = await request(app).get(`/orders/track?orderNumber=${orderNumber}`);
    expect(trackByOrderRes.status).toBe(200);
    expect(Array.isArray(trackByOrderRes.body)).toBe(true);
    expect(trackByOrderRes.body.length).toBe(1);
    expect(trackByOrderRes.body[0].customerName).toBe("سا***");
    expect(trackByOrderRes.body[0].phoneNumber).toContain("****");
    expect(trackByOrderRes.body[0].notes).toBe("");

    // 5. Tracking by phone succeeds and PII is masked (IDOR-02)
    const trackByPhoneRes = await request(app).get("/orders/track?phone=01098765432");
    expect(trackByPhoneRes.status).toBe(200);
    expect(Array.isArray(trackByPhoneRes.body)).toBe(true);
    expect(trackByPhoneRes.body.length).toBe(1);
    expect(trackByPhoneRes.body[0].customerName).toBe("سا***");
  });

  it("SEC-04: POST /staff/login - rejects empty username", async () => {
    const res = await request(app).post("/staff/login").send({
      username: "",
      password: ADMIN_INITIAL_PASSWORD,
      role: "owner",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("اسم المستخدم مطلوب");
  });

  it("SEC-06: POST /staff/login - successful owner login sets SameSite=Strict cookie", async () => {
    const res = await request(app).post("/staff/login").send({
      username: "admin",
      password: ADMIN_INITIAL_PASSWORD,
      role: "owner",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    const rawCookies = res.headers["set-cookie"];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : typeof rawCookies === "string"
      ? [rawCookies]
      : [];
    expect(cookies.length).toBeGreaterThan(0);
    const sessionCookie = cookies.find((c: string) => c.startsWith("staff_session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(sessionCookie).toContain("HttpOnly");
  });

  it("SEC-03: POST /staff/claim-owner - blocks claiming when owner already exists", async () => {
    const token = createSessionToken(1);
    const res = await request(app)
      .post("/staff/claim-owner")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("مالك المتجر");
  });

  it("GET /orders - requires staff authorization", async () => {
    const unauthRes = await request(app).get("/orders");
    expect(unauthRes.status).toBe(401);

    const validToken = createSessionToken(1);
    const authRes = await request(app)
      .get("/orders")
      .set("Authorization", `Bearer ${validToken}`);

    expect(authRes.status).toBe(200);
    expect(Array.isArray(authRes.body)).toBe(true);
  });

  it("normalizeWhatsAppNumber - formats Egyptian phone numbers correctly", () => {
    expect(normalizeWhatsAppNumber("01012345678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("01198765432")).toBe("201198765432");
    expect(normalizeWhatsAppNumber("01234567890")).toBe("201234567890");
    expect(normalizeWhatsAppNumber("01555555555")).toBe("201555555555");
    expect(normalizeWhatsAppNumber("201012345678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("+20-101-234-5678")).toBe("201012345678");
  });

  it("GET /customers - requires staff authorization and classifies direct vs other customers", async () => {
    const unauthRes = await request(app).get("/customers");
    expect(unauthRes.status).toBe(401);

    const validToken = createSessionToken(1);

    // Create a direct POS customer order as authenticated staff
    const posRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        customerName: "عميل مباشر",
        phoneNumber: "01088887777",
        pickupDate: "2026-04-16",
        pickupTime: "استلام فوري (كاشير)",
        paymentMethod: "cash",
        paymentStatus: "paid",
        depositAmount: 100,
        createdBy: "admin",
        status: "delivered",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(posRes.status).toBe(201);

    const authRes = await request(app)
      .get("/customers")
      .set("Authorization", `Bearer ${validToken}`);

    expect(authRes.status).toBe(200);
    expect(Array.isArray(authRes.body)).toBe(true);
    expect(authRes.body.length).toBeGreaterThanOrEqual(2);

    const directCustomer = authRes.body.find((c: any) => c.phoneNumber === "01088887777");
    expect(directCustomer).toBeDefined();
    expect(directCustomer.customerType).toBe("direct");
    expect(directCustomer.directOrdersCount).toBe(1);
    expect(directCustomer.otherOrdersCount).toBe(0);

    const onlineCustomer = authRes.body.find((c: any) => c.customerType === "other");
    expect(onlineCustomer).toBeDefined();
    expect(onlineCustomer.otherOrdersCount).toBeGreaterThanOrEqual(1);
    expect(onlineCustomer).toHaveProperty("normalizedPhone");

    // Two different customer names sharing the same phone should both appear
    const sharedPhoneRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        customerName: "سارة إبراهيم",
        phoneNumber: "01088887777",
        pickupDate: "2026-04-17",
        pickupTime: "04:00 م",
        paymentMethod: "cash",
        paymentStatus: "unpaid",
        createdBy: "guest",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(sharedPhoneRes.status).toBe(201);

    const afterSharedRes = await request(app)
      .get("/customers")
      .set("Authorization", `Bearer ${validToken}`);
    expect(afterSharedRes.status).toBe(200);
    const matchingPhoneEntries = afterSharedRes.body.filter((c: any) => c.phoneNumber === "01088887777");
    expect(matchingPhoneEntries.length).toBe(2);
    expect(matchingPhoneEntries.some((c: any) => c.customerType === "direct")).toBe(true);
    expect(matchingPhoneEntries.some((c: any) => c.customerType === "other" && c.customerName === "سارة إبراهيم")).toBe(true);
  });

  it("GET /orders/:orderId - retrieves any order by id (not only the latest) even after status change", async () => {
    const validToken = createSessionToken(1);

    const firstOrderRes = await request(app)
      .post("/orders")
      .send({
        customerName: "أول طلب",
        phoneNumber: "01077771111",
        pickupDate: "2026-04-20",
        pickupTime: "11:00",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(firstOrderRes.status).toBe(201);
    const firstId = firstOrderRes.body.id;

    const secondOrderRes = await request(app)
      .post("/orders")
      .send({
        customerName: "ثاني طلب",
        phoneNumber: "01077772222",
        pickupDate: "2026-04-20",
        pickupTime: "12:00",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(secondOrderRes.status).toBe(201);

    // Fetch the older (first) order by ID directly
    const fetchOldRes = await request(app)
      .get(`/orders/${firstId}`)
      .set("Authorization", `Bearer ${validToken}`);
    expect(fetchOldRes.status).toBe(200);
    expect(fetchOldRes.body.id).toBe(firstId);
    expect(fetchOldRes.body.customerName).toBe("أول طلب");

    // Accept the order and verify it is still retrievable by ID with updated status
    const patchRes = await request(app)
      .patch(`/orders/${firstId}`)
      .set("Authorization", `Bearer ${validToken}`)
      .send({ status: "accepted" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("accepted");

    const fetchAfterAcceptRes = await request(app)
      .get(`/orders/${firstId}`)
      .set("Authorization", `Bearer ${validToken}`);
    expect(fetchAfterAcceptRes.status).toBe(200);
    expect(fetchAfterAcceptRes.body.id).toBe(firstId);
    expect(fetchAfterAcceptRes.body.status).toBe("accepted");
  });

  it("GET /dashboard/analytics - filters accurately by specific date, today, week, month, and aggregates kilo + half_kilo counts", async () => {
    const validToken = createSessionToken(1);
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Create two delivered orders on a specific historical date (with both kilo & half_kilo of category 1)
    const specificDate = "2026-02-14";
    const ord1 = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        customerName: "عميل يوم محدد 1",
        phoneNumber: "01066661111",
        pickupDate: specificDate,
        pickupTime: "11:00",
        status: "delivered",
        createdBy: "admin",
        items: [{ categoryId: 1, quantity: 2, unit: "kilo" }],
      });
    expect(ord1.status).toBe(201);

    const ord2 = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        customerName: "عميل يوم محدد 2",
        phoneNumber: "01066662222",
        pickupDate: specificDate,
        pickupTime: "12:00",
        status: "delivered",
        createdBy: "admin",
        items: [{ categoryId: 1, quantity: 1, unit: "half_kilo" }],
      });
    expect(ord2.status).toBe(201);

    // Create a delivered order for today
    const ordToday = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        customerName: "عميل اليوم",
        phoneNumber: "01066663333",
        pickupDate: todayCairo,
        pickupTime: "01:00 م",
        status: "delivered",
        createdBy: "admin",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(ordToday.status).toBe(201);

    // 1. Specific date filter returns ONLY the 2 orders on 2026-02-14
    const specificRes = await request(app)
      .get(`/dashboard/analytics?timeframe=custom&date=${specificDate}&statusMode=delivered`)
      .set("Authorization", `Bearer ${validToken}`);
    expect(specificRes.status).toBe(200);
    expect(specificRes.body.summary.totalOrders).toBe(2);
    expect(specificRes.body.summary.totalWeightKg).toBe(2.5);
    expect(specificRes.body.dailyOrders).toHaveLength(1);
    expect(specificRes.body.dailyOrders[0].date).toBe(specificDate);

    const cat1 = specificRes.body.categoryTotals.find((c: any) => c.categoryId === 1);
    expect(cat1).toBeDefined();
    expect(cat1.ordersCount).toBe(2);
    expect(cat1.kilosSold).toBe(2);
    expect(cat1.halfKilosSold).toBe(1);
    expect(cat1.totalWeightKg).toBe(2.5);

    // 2. Today timeframe returns ONLY today's orders (excludes 2026-02-14)
    const todayRes = await request(app)
      .get("/dashboard/analytics?timeframe=today&statusMode=delivered")
      .set("Authorization", `Bearer ${validToken}`);
    expect(todayRes.status).toBe(200);
    expect(todayRes.body.dailyOrders.every((d: any) => d.date === todayCairo)).toBe(true);
    expect(todayRes.body.dailyOrders.some((d: any) => d.date === specificDate)).toBe(false);

    // 3. Empty date returns zero orders (not full season!)
    const emptyDateRes = await request(app)
      .get("/dashboard/analytics?timeframe=custom&date=2025-01-01&statusMode=delivered")
      .set("Authorization", `Bearer ${validToken}`);
    expect(emptyDateRes.status).toBe(200);
    expect(emptyDateRes.body.summary.totalOrders).toBe(0);
    expect(emptyDateRes.body.summary.totalRevenue).toBe(0);
    expect(emptyDateRes.body.categoryTotals).toEqual([]);
  });

  it("Staff Shifts & Per-Employee Delivered Revenue: tracks shifts, simultaneous multi-staff isolation, off-shift deliveries, and Owner-only profiles", async () => {
    const ownerToken = createSessionToken(1);

    // Add a regular staff cashier to fallbackUsers for multi-staff test
    const cashierId = 99;
    if (!fallbackUsers.some((u) => u.id === cashierId)) {
      fallbackUsers.push({
        id: cashierId,
        username: "cashier_ali",
        fullName: "علي كاشير",
        email: "ali@local",
        passwordHash: hashPassword("pass123"),
        role: "staff",
        status: "approved",
        staffAccess: true,
        permissions: ["orders"],
      });
    }
    const staffToken = createSessionToken(cashierId);

    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // 1. Staff delivers an off-shift POS order (soft reminder allows working before Start Shift)
    const offShiftPosRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        customerName: "عميل مباشر",
        phoneNumber: "01055550001",
        pickupDate: todayCairo,
        pickupTime: "استلام فوري (كاشير)",
        paymentMethod: "cash",
        paymentStatus: "paid",
        depositAmount: 100,
        createdBy: "admin",
        status: "delivered",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(offShiftPosRes.status).toBe(201);
    const offShiftPrice = offShiftPosRes.body.totalPrice;

    // 2. Staff starts shift (201), duplicate start rejected (409)
    const startRes = await request(app)
      .post("/shifts/start")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(startRes.status).toBe(201);
    expect(startRes.body.shift.status).toBe("active");

    const dupStartRes = await request(app)
      .post("/shifts/start")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(dupStartRes.status).toBe(409);

    // 3. Owner starts shift simultaneously on another session
    const ownerStartRes = await request(app)
      .post("/shifts/start")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerStartRes.status).toBe(201);

    // 4. Staff creates a delivered POS sale (instapay) + marks an online pending order delivered (vodafone_cash)
    const staffPosRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        customerName: "عميل مباشر",
        phoneNumber: "01055550002",
        pickupDate: todayCairo,
        pickupTime: "استلام فوري (كاشير)",
        paymentMethod: "instapay",
        paymentStatus: "paid",
        depositAmount: 200,
        createdBy: "admin",
        status: "delivered",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(staffPosRes.status).toBe(201);

    const onlinePendingRes = await request(app)
      .post("/orders")
      .send({
        customerName: "عميل أونلاين",
        phoneNumber: "01055550003",
        pickupDate: todayCairo,
        pickupTime: "04:00 م",
        paymentMethod: "vodafone_cash",
        items: [{ categoryId: 1, quantity: 2, unit: "kilo" }],
      });
    expect(onlinePendingRes.status).toBe(201);

    const deliverRes = await request(app)
      .patch(`/orders/${onlinePendingRes.body.id}`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "delivered", paymentMethod: "vodafone_cash" });
    expect(deliverRes.status).toBe(200);

    // Owner makes a separate POS sale during owner's active shift — should NOT mix with cashier_ali's shift
    const ownerPosRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        customerName: "عميل مباشر",
        phoneNumber: "01055550004",
        pickupDate: todayCairo,
        pickupTime: "استلام فوري (كاشير)",
        paymentMethod: "card",
        paymentStatus: "paid",
        createdBy: "admin",
        status: "delivered",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(ownerPosRes.status).toBe(201);

    // 5. GET /shifts/me reflects only staff's active shift live totals
    const meRes = await request(app)
      .get("/shifts/me")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(meRes.status).toBe(200);
    const expectedStaffShiftRev = Number(
      (staffPosRes.body.totalPrice + onlinePendingRes.body.totalPrice).toFixed(2),
    );
    expect(meRes.body.activeShift.deliveredOrdersCount).toBe(2);
    expect(meRes.body.activeShift.deliveredRevenue).toBe(expectedStaffShiftRev);
    expect(meRes.body.activeShift.paymentBreakdown.instapay).toBe(staffPosRes.body.totalPrice);
    expect(meRes.body.activeShift.paymentBreakdown.vodafone_cash).toBe(onlinePendingRes.body.totalPrice);

    // 6. RBAC: regular staff cannot access Owner-only overview or employee profile
    const forbiddenOverview = await request(app)
      .get("/shifts/overview")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(forbiddenOverview.status).toBe(403);

    const forbiddenProfile = await request(app)
      .get(`/staff/users/${cashierId}/revenue-profile`)
      .set("Authorization", `Bearer ${staffToken}`);
    expect(forbiddenProfile.status).toBe(403);

    // 7. Staff ends shift with handover notes -> freezes totals
    const endRes = await request(app)
      .post("/shifts/end")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ notes: "تم تسليم الدرج كامل" });
    expect(endRes.status).toBe(200);
    expect(endRes.body.shift.status).toBe("closed");
    expect(endRes.body.shift.deliveredOrdersCount).toBe(2);
    expect(endRes.body.shift.deliveredRevenue).toBe(expectedStaffShiftRev);
    expect(endRes.body.shift.notes).toBe("تم تسليم الدرج كامل");

    // 8. Owner views /shifts/overview and /staff/users/:userId/revenue-profile
    const overviewRes = await request(app)
      .get("/shifts/overview")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.closedShifts.some((s: any) => s.userId === String(cashierId))).toBe(true);
    expect(overviewRes.body.activeShifts.some((s: any) => s.userId === "1")).toBe(true);

    const profileRes = await request(app)
      .get(`/staff/users/${cashierId}/revenue-profile?timeframe=today`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.employee.username).toBe("cashier_ali");
    expect(profileRes.body.days).toHaveLength(1);
    const todayDay = profileRes.body.days[0];
    expect(todayDay.date).toBe(todayCairo);
    // Combines 2 in-shift deliveries + 1 off-shift delivery = 3 total orders
    expect(todayDay.deliveredOrdersCount).toBe(3);
    expect(todayDay.offShiftOrdersCount).toBe(1);
    expect(todayDay.offShiftRevenue).toBe(offShiftPrice);
    expect(todayDay.deliveredRevenue).toBe(Number((expectedStaffShiftRev + offShiftPrice).toFixed(2)));
    expect(todayDay.paymentBreakdown.cash).toBe(offShiftPrice);
    expect(todayDay.paymentBreakdown.instapay).toBe(staffPosRes.body.totalPrice);
    expect(todayDay.paymentBreakdown.vodafone_cash).toBe(onlinePendingRes.body.totalPrice);

    // Clean up owner active shift for cleanliness
    const ownerEndRes = await request(app)
      .post("/shifts/end")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(ownerEndRes.status).toBe(200);
  });
});

describe("Staff User Workflow & Security Audit Regressions", () => {
  const ownerToken = createSessionToken(1);

  it("supports x-staff-session header auth, case-insensitive/email login, and distinct pending vs disabled 403 notices", async () => {
    // 1. Register mixed-case staff user -> stored lowercased & pending
    const regRes = await request(app).post("/staff/register").send({
      username: "Cashier_Case",
      fullName: "Nour ElDin",
      email: "nour@fetoh.test",
      password: "Password123",
    });
    expect(regRes.status).toBe(201);

    // 2. Pending login returns pendingApproval: true
    const pendingLogin = await request(app).post("/staff/login").send({
      username: "CASHIER_CASE",
      password: "Password123",
      role: "staff",
    });
    expect(pendingLogin.status).toBe(403);
    expect(pendingLogin.body.pendingApproval).toBe(true);
    expect(pendingLogin.body.accountDisabled).toBe(false);

    // 3. Approve staff & verify 'team' permission cannot be assigned to non-owner staff
    const listRes = await request(app)
      .get("/staff/users")
      .set("x-staff-session", ownerToken);
    expect(listRes.status).toBe(200);
    const nour = listRes.body.find((u: any) => u.username === "cashier_case");
    expect(nour).toBeDefined();

    const patchRes = await request(app)
      .patch(`/staff/users/${nour.userId}`)
      .set("x-staff-session", ownerToken)
      .send({ staffAccess: true, status: "approved", permissions: ["orders", "team"] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.permissions).toEqual(["orders"]);

    // 4. Login via email with mixed case works & returns token
    const emailLogin = await request(app).post("/staff/login").send({
      username: "NOUR@FETOH.TEST",
      password: "Password123",
      role: "staff",
    });
    expect(emailLogin.status).toBe(200);
    const staffToken = emailLogin.body.token;
    expect(staffToken).toBeTruthy();

    // 5. Authenticate exclusively with x-staff-session (no Authorization header or cookie)
    const accessRes = await request(app)
      .get("/staff/access")
      .set("x-staff-session", staffToken);
    expect(accessRes.status).toBe(200);
    expect(accessRes.body.staffAccess).toBe(true);
    expect(accessRes.body.name).toBe("Nour ElDin");
    expect(accessRes.body.username).toBe("cashier_case");

    // 6. Disable staff -> login returns accountDisabled: true
    const disableRes = await request(app)
      .patch(`/staff/users/${nour.userId}`)
      .set("x-staff-session", ownerToken)
      .send({ staffAccess: false });
    expect(disableRes.status).toBe(200);

    const disabledLogin = await request(app).post("/staff/login").send({
      username: "cashier_case",
      password: "Password123",
      role: "staff",
    });
    expect(disabledLogin.status).toBe(403);
    expect(disabledLogin.body.pendingApproval).toBe(false);
    expect(disabledLogin.body.accountDisabled).toBe(true);
  });

  it("enforces inventory-only permission boundaries and blocks owner deletion + auto-closes deleted staff shifts", async () => {
    const invUser = {
      id: 992,
      username: "inv_only_user",
      fullName: "Inventory Manager",
      email: "inv@fetoh.test",
      passwordHash: hashPassword("inv1234"),
      role: "staff" as const,
      status: "approved" as const,
      staffAccess: true,
      permissions: ["inventory" as const],
    };
    fallbackUsers.push(invUser);
    const invToken = createSessionToken(invUser.id);

    // inventory-only staff can read GET /orders (for Stock Demand)
    const ordersRes = await request(app)
      .get("/orders")
      .set("x-staff-session", invToken);
    expect(ordersRes.status).toBe(200);

    // inventory-only staff cannot start shifts (403)
    const shiftStartRes = await request(app)
      .post("/shifts/start")
      .set("x-staff-session", invToken);
    expect(shiftStartRes.status).toBe(403);

    // inventory-only staff submitting createdBy: admin is downgraded to guest/pending
    const orderAttempt = await request(app)
      .post("/orders")
      .set("x-staff-session", invToken)
      .send({
        customerName: "عميل غير مصرح",
        phoneNumber: "01055551111",
        pickupDate: "2026-04-20",
        pickupTime: "12:00",
        createdBy: "admin",
        status: "delivered",
        items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      });
    expect(orderAttempt.status).toBe(201);
    expect(orderAttempt.body.createdBy).toBe("guest");
    expect(orderAttempt.body.status).toBe("pending");

    // Cannot delete Owner account (400)
    const delOwnerRes = await request(app)
      .delete("/staff/users/1")
      .set("x-staff-session", ownerToken);
    expect(delOwnerRes.status).toBe(400);

    // Grant cashier active shift then delete user -> active shift auto-closed
    const tempStaff = {
      id: 993,
      username: "temp_cashier",
      fullName: "Temp Cashier",
      email: "temp@fetoh.test",
      passwordHash: hashPassword("temp1234"),
      role: "staff" as const,
      status: "approved" as const,
      staffAccess: true,
      permissions: ["orders" as const],
    };
    fallbackUsers.push(tempStaff);
    const tempToken = createSessionToken(tempStaff.id);
    const startTempShift = await request(app)
      .post("/shifts/start")
      .set("x-staff-session", tempToken);
    expect(startTempShift.status).toBe(201);

    const delStaffRes = await request(app)
      .delete(`/staff/users/${tempStaff.id}`)
      .set("x-staff-session", ownerToken);
    expect(delStaffRes.status).toBe(200);

    const overviewRes = await request(app)
      .get("/shifts/overview")
      .set("x-staff-session", ownerToken);
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.activeShifts.some((s: any) => s.userId === String(tempStaff.id))).toBe(false);
  });

  it("auto-marks delivered orders paid, recalculates closed shifts on revert/paymentMethod edit, and allows owner force-end", async () => {
    const revStaff = {
      id: 994,
      username: "rev_cashier",
      fullName: "Revenue Cashier",
      email: "rev@fetoh.test",
      passwordHash: hashPassword("rev1234"),
      role: "staff" as const,
      status: "approved" as const,
      staffAccess: true,
      permissions: ["orders" as const],
    };
    fallbackUsers.push(revStaff);
    const revToken = createSessionToken(revStaff.id);

    // 1. Start shift
    const sRes = await request(app).post("/shifts/start").set("x-staff-session", revToken);
    expect(sRes.status).toBe(201);
    const shiftId = sRes.body.shift.id;

    // 2. Non-owner cannot force-end shift (403)
    const nonOwnerForce = await request(app)
      .post(`/shifts/${shiftId}/force-end`)
      .set("x-staff-session", revToken)
      .send({});
    expect(nonOwnerForce.status).toBe(403);

    // 3. Create 2 guest orders & deliver both via PATCH
    const o1 = await request(app).post("/orders").send({
      customerName: "عميل 1",
      phoneNumber: "01055552201",
      pickupDate: "2026-04-21",
      pickupTime: "01:00 م",
      items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
    });
    const o2 = await request(app).post("/orders").send({
      customerName: "عميل 2",
      phoneNumber: "01055552202",
      pickupDate: "2026-04-21",
      pickupTime: "02:00 م",
      items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
    });

    const d1 = await request(app)
      .patch(`/orders/${o1.body.id}`)
      .set("x-staff-session", revToken)
      .send({ status: "delivered", paymentMethod: "cash" });
    expect(d1.status).toBe(200);
    // Auto-settled Paid on delivered transition
    expect(d1.body.paymentStatus).toBe("paid");
    expect(d1.body.remainingBalance).toBe(0);
    expect(d1.body.depositAmount).toBe(o1.body.totalPrice);

    const d2 = await request(app)
      .patch(`/orders/${o2.body.id}`)
      .set("x-staff-session", revToken)
      .send({ status: "delivered", paymentMethod: "card" });
    expect(d2.status).toBe(200);

    // 4. Owner force-ends the shift cleanly
    const forceEndRes = await request(app)
      .post(`/shifts/${shiftId}/force-end`)
      .set("x-staff-session", ownerToken)
      .send({ notes: "إغلاق إداري" });
    expect(forceEndRes.status).toBe(200);
    expect(forceEndRes.body.shift.status).toBe("closed");
    expect(forceEndRes.body.shift.deliveredOrdersCount).toBe(2);
    expect(forceEndRes.body.shift.notes).toBe("إغلاق إداري");

    // 5. Edit paymentMethod of delivered order #2 while shift is already closed (card -> instapay)
    const methodEdit = await request(app)
      .patch(`/orders/${o2.body.id}`)
      .set("x-staff-session", ownerToken)
      .send({ paymentMethod: "instapay" });
    expect(methodEdit.status).toBe(200);

    // 6. Revert order #1 out of delivered back to ready -> closed shift snapshot recalculates!
    const revertRes = await request(app)
      .patch(`/orders/${o1.body.id}`)
      .set("x-staff-session", ownerToken)
      .send({ status: "ready" });
    expect(revertRes.status).toBe(200);

    const profileRes = await request(app)
      .get(`/staff/users/${revStaff.id}/revenue-profile`)
      .set("x-staff-session", ownerToken);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.summary.totalOrders).toBe(1);
    expect(profileRes.body.summary.totalRevenue).toBe(o2.body.totalPrice);
    expect(profileRes.body.summary.paymentBreakdown.cash).toBe(0);
    expect(profileRes.body.summary.paymentBreakdown.card).toBe(0);
    expect(profileRes.body.summary.paymentBreakdown.instapay).toBe(o2.body.totalPrice);
  });
});
