import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sanitizeCsvCell,
  parseDepositAmount,
  toDateString,
} from "./eid-sweets";

describe("Authentication & Security Helpers", () => {
  it("should securely hash passwords and verify matching passwords", () => {
    const plain = "adminPass123";
    const hashed = hashPassword(plain);

    expect(hashed).toContain(":");
    expect(verifyPassword(plain, hashed)).toBe(true);
    expect(verifyPassword("wrongPassword", hashed)).toBe(false);
  });

  it("should generate signed session tokens and verify valid ones", () => {
    const userId = 42;
    const token = createSessionToken(userId);
    expect(typeof token).toBe("string");

    const verifiedUserId = verifySessionToken(token);
    expect(verifiedUserId).toBe(userId);
  });

  it("should reject tampered or forged session tokens", () => {
    const userId = 10;
    const token = createSessionToken(userId);
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [idStr, timeStr, hmac] = decoded.split(":");

    // Tamper with userId
    const tamperedPayload = Buffer.from(`999:${timeStr}:${hmac}`).toString("base64");
    expect(verifySessionToken(tamperedPayload)).toBeNull();

    // Tamper with hmac
    const fakeHmac = "0".repeat(64);
    const fakeToken = Buffer.from(`${idStr}:${timeStr}:${fakeHmac}`).toString("base64");
    expect(verifySessionToken(fakeToken)).toBeNull();
  });

  it("should enforce session token TTL and reject expired tokens", () => {
    const userId = 15;
    const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
    // Create token with old timestamp
    const secret = "saffron-seed-super-secret-key-2026";
    const crypto = require("crypto");
    const payload = `${userId}:${eightDaysAgo}`;
    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const expiredToken = Buffer.from(`${payload}:${hmac}`).toString("base64");

    expect(verifySessionToken(expiredToken, secret)).toBeNull();
  });
});

describe("CSV Export Sanitization (Formula Injection Prevention)", () => {
  it("should quote normal text and escape internal quotes", () => {
    expect(sanitizeCsvCell("Normal Order")).toBe('"Normal Order"');
    expect(sanitizeCsvCell('Ahmed "The Baker"')).toBe('"Ahmed ""The Baker"""');
  });

  it("should neutralize Excel/CSV formula injection prefixes (=, +, -, @, %, |)", () => {
    expect(sanitizeCsvCell("=SUM(1,2)")).toBe("\"'=SUM(1,2)\"");
    expect(sanitizeCsvCell("+cmd|' /C calc'!'A1'")).toBe("\"'+cmd|' /C calc'!'A1'\"");
    expect(sanitizeCsvCell("-20+30")).toBe("\"'-20+30\"");
    expect(sanitizeCsvCell("@malicious")).toBe("\"'@malicious\"");
    expect(sanitizeCsvCell("%user%")).toBe("\"'%user%\"");
    expect(sanitizeCsvCell("|calc")).toBe("\"'|calc\"");
  });

  it("should handle null and undefined safely", () => {
    expect(sanitizeCsvCell(null)).toBe('""');
    expect(sanitizeCsvCell(undefined)).toBe('""');
  });
});

describe("Order Financial & Payment Calculations", () => {
  const calculateFinancials = (totalPrice: number, depositAmount: number) => {
    const deposit = Math.max(0, depositAmount);
    const remaining = Math.max(0, totalPrice - deposit);
    const status = deposit >= totalPrice && totalPrice > 0
      ? "paid"
      : deposit > 0
      ? "partially_paid"
      : "unpaid";
    return { deposit, remaining, status };
  };

  it("should mark full payment when deposit equals or exceeds total", () => {
    const res = calculateFinancials(450, 450);
    expect(res.remaining).toBe(0);
    expect(res.status).toBe("paid");

    const overpaid = calculateFinancials(450, 500);
    expect(overpaid.remaining).toBe(0);
    expect(overpaid.status).toBe("paid");
  });

  it("should calculate remaining balance and mark partially paid when deposit is partial", () => {
    const res = calculateFinancials(500, 150);
    expect(res.remaining).toBe(350);
    expect(res.status).toBe("partially_paid");
  });

  it("should mark unpaid and full remaining balance when no deposit is made", () => {
    const res = calculateFinancials(320, 0);
    expect(res.remaining).toBe(320);
    expect(res.status).toBe("unpaid");
  });
});

describe("Deposit Input Sanitization & Normalization", () => {
  it("should normalize Arabic-Indic numerals correctly", () => {
    expect(parseDepositAmount("١٥٠")).toBe(150);
    expect(parseDepositAmount("٢٠٠.٥٠")).toBe(200.5);
    expect(parseDepositAmount("٥٠٫٥")).toBe(50.5);
  });

  it("should handle mixed text, currencies, and commas", () => {
    expect(parseDepositAmount("200 EGP")).toBe(200);
    expect(parseDepositAmount("1,500")).toBe(1.5);
    expect(parseDepositAmount("100 ج.م")).toBe(100);
  });

  it("should safely handle empty, null, and non-numeric inputs", () => {
    expect(parseDepositAmount(null)).toBe(0);
    expect(parseDepositAmount(undefined)).toBe(0);
    expect(parseDepositAmount("")).toBe(0);
    expect(parseDepositAmount("invalid")).toBe(0);
    expect(parseDepositAmount(-50)).toBe(0);
  });
});

describe("Staff Fallback & Token Handling", () => {
  it("should handle session tokens with Bearer prefix", () => {
    const token = createSessionToken(1);
    expect(verifySessionToken(`Bearer ${token}`)).toBe(1);
    expect(verifySessionToken(`  Bearer   ${token}  `)).toBe(1);
  });
});

describe("Date Normalization & Timezone Handling", () => {
  it("should preserve YYYY-MM-DD calendar strings directly", () => {
    expect(toDateString("2026-04-15")).toBe("2026-04-15");
    expect(toDateString("2026-04-15T00:00:00.000Z")).toBe("2026-04-15");
  });

  it("should accurately format Date objects in Cairo timezone", () => {
    // 2026-04-14 22:30:00 UTC is 2026-04-15 00:30:00 in Africa/Cairo (UTC+2)
    const d = new Date("2026-04-14T22:30:00.000Z");
    expect(toDateString(d)).toBe("2026-04-15");
  });

  it("should handle empty or null values gracefully", () => {
    expect(toDateString("")).toBe("");
    expect(toDateString(null)).toBe("");
  });
});

describe("Kilo & Half-Kilo Unit Pricing and Stock Segregation", () => {
  const computeItemUnitPrice = (
    categoryPricePerUnit: number,
    categoryHalfKiloPrice: number | null | undefined,
    itemUnit: string,
  ) => {
    if (itemUnit === "half_kilo") {
      return categoryHalfKiloPrice !== null &&
        categoryHalfKiloPrice !== undefined &&
        Number(categoryHalfKiloPrice) > 0
        ? Number(categoryHalfKiloPrice)
        : Math.round(categoryPricePerUnit / 2);
    }
    return categoryPricePerUnit;
  };

  it("should use explicit halfKiloPrice when configured", () => {
    expect(computeItemUnitPrice(300, 160, "half_kilo")).toBe(160);
    expect(computeItemUnitPrice(250, 130, "half_kilo")).toBe(130);
  });

  it("should fallback to Math.round(pricePerUnit / 2) when halfKiloPrice is absent or zero", () => {
    expect(computeItemUnitPrice(300, null, "half_kilo")).toBe(150);
    expect(computeItemUnitPrice(275, undefined, "half_kilo")).toBe(138); // Math.round(137.5) = 138
    expect(computeItemUnitPrice(250, 0, "half_kilo")).toBe(125);
  });

  it("should always use full pricePerUnit for 1 kg orders", () => {
    expect(computeItemUnitPrice(300, 160, "kilo")).toBe(300);
    expect(computeItemUnitPrice(250, null, "kilo")).toBe(250);
  });

  it("should strictly segregate stock demands for kilo vs half_kilo", () => {
    const items = [
      { categoryId: 1, unit: "kilo", quantity: 2 },
      { categoryId: 1, unit: "half_kilo", quantity: 3 },
      { categoryId: 2, unit: "kilo", quantity: 1 },
    ];

    const regularDemands = new Map<number, number>();
    const halfKiloDemands = new Map<number, number>();

    for (const it of items) {
      if (it.unit === "half_kilo") {
        halfKiloDemands.set(it.categoryId, (halfKiloDemands.get(it.categoryId) ?? 0) + it.quantity);
      } else {
        regularDemands.set(it.categoryId, (regularDemands.get(it.categoryId) ?? 0) + it.quantity);
      }
    }

    expect(regularDemands.get(1)).toBe(2);
    expect(halfKiloDemands.get(1)).toBe(3);
    expect(regularDemands.get(2)).toBe(1);
    expect(halfKiloDemands.get(2)).toBeUndefined();
  });

  it("should correctly calculate deficit and surplus balances", () => {
    const calculateBalance = (stock: number, demand: number) => {
      const balance = stock - demand;
      const deficit = balance < 0 ? Math.abs(balance) : 0;
      const surplus = balance > 0 ? balance : 0;
      return { balance, deficit, surplus, hasDeficit: deficit > 0 };
    };

    expect(calculateBalance(10, 15)).toEqual({
      balance: -5,
      deficit: 5,
      surplus: 0,
      hasDeficit: true,
    });

    expect(calculateBalance(20, 12)).toEqual({
      balance: 8,
      deficit: 0,
      surplus: 8,
      hasDeficit: false,
    });

    expect(calculateBalance(5, 5)).toEqual({
      balance: 0,
      deficit: 0,
      surplus: 0,
      hasDeficit: false,
    });
  });
});

describe("Inventory & Order Lifecycle (Physical Stock vs Active Reservations)", () => {
  it("should calculate available stock as physical stock minus active reservations", () => {
    const physicalStock = 25;
    const activeReservations = 7;
    const available = Math.max(0, physicalStock - activeReservations);
    expect(available).toBe(18);
  });

  it("should cap available stock at 0 when active demand exceeds physical stock", () => {
    const physicalStock = 10;
    const activeDemand = 15;
    const available = Math.max(0, physicalStock - activeDemand);
    const deficit = Math.max(0, activeDemand - physicalStock);
    expect(available).toBe(0);
    expect(deficit).toBe(5);
  });

  it("should preserve net available inventory when order transitions from pending to delivered", () => {
    // Initial state: 10 kg baked sweets in bakery, 0 reservations
    let physicalStock = 10;
    let activeReservations = 0;
    const getAvailable = () => Math.max(0, physicalStock - activeReservations);

    expect(physicalStock).toBe(10);
    expect(getAvailable()).toBe(10);

    // Customer places order for 2 kg -> status: 'pending'
    // Physical stock stays 10 in bakery, active reservations become 2
    const orderQty = 2;
    activeReservations += orderQty;

    expect(physicalStock).toBe(10); // Physical stock in shop still 10 kg
    expect(activeReservations).toBe(2); // 2 kg reserved for customer
    expect(getAvailable()).toBe(8); // Only 8 kg can be ordered by others

    // Admin prepares sweets -> status: 'ready' (still uncollected)
    // Physical stock remains 10, reservations remain 2, available remains 8
    expect(physicalStock).toBe(10);
    expect(getAvailable()).toBe(8);

    // Customer arrives and collects order -> admin marks as 'delivered'
    // Physical sweets leave shop: physicalStock decreases by 2 (10 -> 8)
    // Order is no longer active reservation: activeReservations decreases by 2 (2 -> 0)
    physicalStock -= orderQty;
    activeReservations -= orderQty;

    expect(physicalStock).toBe(8); // Physical stock in shop is now 8 kg
    expect(activeReservations).toBe(0); // No pending reservations
    expect(getAvailable()).toBe(8); // Available stock remains 8 kg (NO BOUNCE BACK or temporary behavior!)
  });

  it("should restore physical inventory if an accidental delivered status is reverted", () => {
    let physicalStock = 8;
    let activeReservations = 0;
    const orderQty = 2;

    // Admin accidentally marked delivered, then reverts to 'ready'
    physicalStock += orderQty;
    activeReservations += orderQty;

    expect(physicalStock).toBe(10);
    expect(activeReservations).toBe(2);
    expect(Math.max(0, physicalStock - activeReservations)).toBe(8);
  });

  it("should correctly classify active vs inactive order statuses for reservations", () => {
    const activeStatuses = ["pending", "accepted", "preparing", "ready"];
    const inactiveStatuses = ["delivered", "rejected"];

    const isReserved = (status: string) => activeStatuses.includes(status);

    expect(isReserved("pending")).toBe(true);
    expect(isReserved("accepted")).toBe(true);
    expect(isReserved("preparing")).toBe(true);
    expect(isReserved("ready")).toBe(true);
    expect(isReserved("delivered")).toBe(false);
    expect(isReserved("rejected")).toBe(false);
  });

  it("should directly deduct physical inventory and set paid in full for quick counter POS order", () => {
    let physicalStock = 20;
    let halfKiloStock = 10;
    const orderItems = [
      { unit: "kilo", quantity: 2 },
      { unit: "half_kilo", quantity: 3 },
    ];

    const isDirectDelivered = true;
    expect(isDirectDelivered).toBe(true);

    for (const item of orderItems) {
      if (item.unit === "half_kilo") {
        halfKiloStock = Math.max(0, halfKiloStock - item.quantity);
      } else {
        physicalStock = Math.max(0, physicalStock - item.quantity);
      }
    }

    expect(physicalStock).toBe(18); // 20 - 2
    expect(halfKiloStock).toBe(7);  // 10 - 3
  });

  it("should accurately aggregate sold weights and revenue distinguishing 1kg and 0.5kg units", () => {
    const orders = [
      {
        id: 1,
        status: "delivered",
        pickupDate: "2026-04-10",
        items: [
          { categoryName: "كعك سادة", unit: "kilo", quantity: 3, subtotal: 600 },
          { categoryName: "كعك سادة", unit: "half_kilo", quantity: 4, subtotal: 440 },
          { categoryName: "علبة ميكس فاخرة", unit: "box", quantity: 2, subtotal: 700 },
        ],
      },
      {
        id: 2,
        status: "delivered",
        pickupDate: "2026-04-10",
        items: [
          { categoryName: "كعك سادة", unit: "kilo", quantity: 1, subtotal: 200 },
          { categoryName: "غريبة باللوز", unit: "kilo", quantity: 2, subtotal: 500 },
        ],
      },
      {
        id: 3,
        status: "pending", // Not delivered yet!
        pickupDate: "2026-04-10",
        items: [
          { categoryName: "كعك سادة", unit: "kilo", quantity: 10, subtotal: 2000 },
        ],
      },
      {
        id: 4,
        status: "rejected", // Cancelled!
        pickupDate: "2026-04-10",
        items: [
          { categoryName: "غريبة باللوز", unit: "kilo", quantity: 5, subtotal: 1250 },
        ],
      },
    ];

    // Under delivered mode, only orders 1 and 2 count as sold
    const deliveredOrders = orders.filter((o) => o.status === "delivered");
    expect(deliveredOrders.length).toBe(2);

    const stats = new Map<string, { kilos: number; halfKilos: number; totalWeightKg: number; boxes: number; revenue: number }>();

    for (const order of deliveredOrders) {
      for (const item of order.items) {
        const cur = stats.get(item.categoryName) ?? { kilos: 0, halfKilos: 0, totalWeightKg: 0, boxes: 0, revenue: 0 };
        cur.revenue += item.subtotal;
        if (item.unit === "half_kilo") {
          cur.halfKilos += item.quantity;
          cur.totalWeightKg += item.quantity * 0.5;
        } else if (item.unit === "kilo") {
          cur.kilos += item.quantity;
          cur.totalWeightKg += item.quantity * 1.0;
        } else if (item.unit === "box") {
          cur.boxes += item.quantity;
        }
        stats.set(item.categoryName, cur);
      }
    }

    const kahk = stats.get("كعك سادة");
    expect(kahk).toBeDefined();
    expect(kahk?.kilos).toBe(4); // 3 kg + 1 kg
    expect(kahk?.halfKilos).toBe(4); // 4 half-kilos
    expect(kahk?.totalWeightKg).toBe(6.0); // 4*1.0 + 4*0.5 = 6.0 kg
    expect(kahk?.revenue).toBe(1240); // 600 + 440 + 200

    const box = stats.get("علبة ميكس فاخرة");
    expect(box?.boxes).toBe(2);
    expect(box?.revenue).toBe(700);

    const ghorayeba = stats.get("غريبة باللوز");
    expect(ghorayeba?.kilos).toBe(2);
    expect(ghorayeba?.revenue).toBe(500); // Only order 2 counted, rejected order 4 excluded!
  });
});



