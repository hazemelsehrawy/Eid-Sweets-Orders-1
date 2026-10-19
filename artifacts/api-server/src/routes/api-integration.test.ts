import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { ADMIN_INITIAL_PASSWORD, createSessionToken } from "./eid-sweets";

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

    // 2. Reject tracking with phone only (IDOR-01)
    const phoneOnlyRes = await request(app).get("/orders/track?phone=01098765432");
    expect(phoneOnlyRes.status).toBe(400);

    // 3. Reject tracking with partial/empty phone (IDOR-01)
    const noPhoneRes = await request(app).get(`/orders/track?orderNumber=${orderNumber}`);
    expect(noPhoneRes.status).toBe(400);

    // 4. Exact tracking succeeds and PII is masked (IDOR-02)
    const validTrackRes = await request(app).get(
      `/orders/track?orderNumber=${orderNumber}&phone=01098765432`,
    );
    expect(validTrackRes.status).toBe(200);
    expect(Array.isArray(validTrackRes.body)).toBe(true);
    expect(validTrackRes.body.length).toBe(1);

    const tracked = validTrackRes.body[0];
    expect(tracked.customerName).toBe("سا***"); // Masked
    expect(tracked.phoneNumber).toContain("****"); // Masked
    expect(tracked.notes).toBe(""); // Omitted
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
});
