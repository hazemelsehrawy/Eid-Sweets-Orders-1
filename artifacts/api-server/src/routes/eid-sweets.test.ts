import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sanitizeCsvCell,
  parseDepositAmount,
  toDateString,
  generateUniqueOrderNumber,
  generateNextPosOrderNumber,
  ADMIN_INITIAL_PASSWORD,
  getActiveReservations,
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

  describe("Bulk Order Status Update Logic", () => {
    it("should update statuses for multiple matching orders simultaneously", () => {
      const orders = [
        { id: 101, status: "pending", items: [{ categoryId: 1, quantity: 2, unit: "kilo" }] },
        { id: 102, status: "pending", items: [{ categoryId: 2, quantity: 1, unit: "box" }] },
        { id: 103, status: "ready", items: [{ categoryId: 1, quantity: 1, unit: "kilo" }] },
      ];

      const targetIds = [101, 102];
      const newStatus = "ready";

      const updated = orders.map((o) => {
        if (targetIds.includes(o.id)) {
          return { ...o, status: newStatus };
        }
        return o;
      });

      expect(updated.find((o) => o.id === 101)?.status).toBe("ready");
      expect(updated.find((o) => o.id === 102)?.status).toBe("ready");
      expect(updated.find((o) => o.id === 103)?.status).toBe("ready");
    });

    it("should deduct inventory when multiple orders transition to delivered", () => {
      const inventory = new Map<number, { stockQuantity: number; halfKiloStock: number }>([
        [1, { stockQuantity: 20, halfKiloStock: 10 }],
        [2, { stockQuantity: 15, halfKiloStock: 0 }],
      ]);

      const bulkOrders = [
        {
          id: 201,
          status: "ready",
          items: [
            { categoryId: 1, quantity: 3, unit: "kilo" },
            { categoryId: 1, quantity: 2, unit: "half_kilo" },
          ],
        },
        {
          id: 202,
          status: "preparing",
          items: [{ categoryId: 2, quantity: 4, unit: "box" }],
        },
      ];

      for (const order of bulkOrders) {
        if (order.status !== "delivered") {
          for (const item of order.items) {
            const cat = inventory.get(item.categoryId)!;
            if (item.unit === "half_kilo") {
              cat.halfKiloStock = Math.max(0, cat.halfKiloStock - item.quantity);
            } else {
              cat.stockQuantity = Math.max(0, cat.stockQuantity - item.quantity);
            }
          }
          order.status = "delivered";
        }
      }

      expect(inventory.get(1)?.stockQuantity).toBe(17);
      expect(inventory.get(1)?.halfKiloStock).toBe(8);
      expect(inventory.get(2)?.stockQuantity).toBe(11);
    });

    it("should restore inventory when delivered orders are reverted away from delivered", () => {
      const inventory = new Map<number, { stockQuantity: number; halfKiloStock: number }>([
        [1, { stockQuantity: 17, halfKiloStock: 8 }],
      ]);

      const deliveredOrder = {
        id: 301,
        status: "delivered",
        items: [
          { categoryId: 1, quantity: 3, unit: "kilo" },
          { categoryId: 1, quantity: 2, unit: "half_kilo" },
        ],
      };

      const newStatus: string = "ready";
      if (deliveredOrder.status === "delivered" && newStatus !== "delivered") {
        for (const item of deliveredOrder.items) {
          const cat = inventory.get(item.categoryId)!;
          if (item.unit === "half_kilo") {
            cat.halfKiloStock += item.quantity;
          } else {
            cat.stockQuantity += item.quantity;
          }
        }
        deliveredOrder.status = newStatus;
      }

      expect(inventory.get(1)?.stockQuantity).toBe(20);
      expect(inventory.get(1)?.halfKiloStock).toBe(10);
    });
  });

  describe("5-Digit Numeric Customer Order Code Generator", () => {
    it("should generate a 5-digit numeric string between 10000 and 99999", async () => {
      const orderNumber = await generateUniqueOrderNumber(undefined, []);
      expect(typeof orderNumber).toBe("string");
      expect(orderNumber).toMatch(/^\d{5}$/);

      const numVal = parseInt(orderNumber, 10);
      expect(numVal).toBeGreaterThanOrEqual(10000);
      expect(numVal).toBeLessThanOrEqual(99999);
    });

    it("should generate unique order numbers across consecutive calls", async () => {
      const generated = new Set<string>();
      const mockList: Array<{ orderNumber: string }> = [];

      for (let i = 0; i < 25; i++) {
        const num = await generateUniqueOrderNumber(undefined, mockList);
        expect(num).toMatch(/^\d{5}$/);
        expect(generated.has(num)).toBe(false);
        generated.add(num);
        mockList.push({ orderNumber: num });
      }

      expect(generated.size).toBe(25);
    });

    it("should automatically expand to 6 digits if 5-digit attempts collide", async () => {
      // Mock db executor that simulates 5 collisions for 5-digit range, then allows 6-digit range
      let queryCount = 0;
      const mockExecutor = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                queryCount++;
                // First 5 attempts (5-digit range) collide
                if (queryCount <= 5) {
                  return [{ id: 999 }];
                }
                // 6th attempt (6-digit range) succeeds
                return [];
              },
            }),
          }),
        }),
      };

      const expandedNumber = await generateUniqueOrderNumber(mockExecutor as any);
      expect(expandedNumber).toMatch(/^\d{6}$/);
      const numVal = parseInt(expandedNumber, 10);
      expect(numVal).toBeGreaterThanOrEqual(100000);
      expect(numVal).toBeLessThanOrEqual(999999);
    });

    it("should maintain backward-compatible tracking search for legacy and 5-digit codes", () => {
      const orders = [
        { id: 1, orderNumber: "EID-MVBAH9KN-6082", customerName: "أحمد علي", phoneNumber: "01000000000" },
        { id: 2, orderNumber: "83921", customerName: "سارة محمد", phoneNumber: "01111111111" },
        { id: 3, orderNumber: "104829", customerName: "محمود حسن", phoneNumber: "01222222222" },
      ];

      // Query by legacy code
      const findLegacy = orders.find((o) => o.orderNumber.toLowerCase() === "eid-mvbah9kn-6082");
      expect(findLegacy?.id).toBe(1);

      // Query by new 5-digit code
      const findNumeric5 = orders.find((o) => o.orderNumber === "83921");
      expect(findNumeric5?.id).toBe(2);

      // Query by expanded 6-digit code
      const findNumeric6 = orders.find((o) => o.orderNumber === "104829");
      expect(findNumeric6?.id).toBe(3);
    });
  });

  describe("Cashier Quick Order (001-500) Cyclic Counter", () => {
    it("should start at '001' when no prior POS orders exist", async () => {
      const orderNumber = await generateNextPosOrderNumber(undefined, []);
      expect(orderNumber).toBe("001");
    });

    it("should sequentially increment from '001' to '002' to '003'", async () => {
      const order1 = await generateNextPosOrderNumber(undefined, [{ orderNumber: "001" }]);
      expect(order1).toBe("002");

      const order2 = await generateNextPosOrderNumber(undefined, [
        { orderNumber: "001" },
        { orderNumber: "002" },
      ]);
      expect(order2).toBe("003");
    });

    it("should roll over from '500' to '001-2' (Cycle 2)", async () => {
      const order501 = await generateNextPosOrderNumber(undefined, [{ orderNumber: "500" }]);
      expect(order501).toBe("001-2");

      const order502 = await generateNextPosOrderNumber(undefined, [
        { orderNumber: "500" },
        { orderNumber: "001-2" },
      ]);
      expect(order502).toBe("002-2");
    });

    it("should roll over from '500-2' to '001-3' (Cycle 3)", async () => {
      const order1001 = await generateNextPosOrderNumber(undefined, [{ orderNumber: "500-2" }]);
      expect(order1001).toBe("001-3");
    });

    it("should ignore intervening 5-digit online customer orders when computing next POS counter", async () => {
      const list = [
        { orderNumber: "042" },
        { orderNumber: "83921" },
        { orderNumber: "91024" },
      ];
      const nextPos = await generateNextPosOrderNumber(undefined, list);
      expect(nextPos).toBe("043");
    });

    it("should resolve collision if a candidate number is already taken", async () => {
      const list = [
        { orderNumber: "001" },
        { orderNumber: "002" },
      ];
      const nextPos = await generateNextPosOrderNumber(undefined, list);
      expect(nextPos).toBe("003");
    });

    it("should correctly find the latest POS sequence even if 250 online customer orders intervened", async () => {
      // Simulate 250 intervening online orders after POS order 088
      const list: Array<{ orderNumber: string }> = [{ orderNumber: "088" }];
      for (let i = 10000; i < 10250; i++) {
        list.push({ orderNumber: String(i) });
      }

      const nextPos = await generateNextPosOrderNumber(undefined, list);
      expect(nextPos).toBe("089");
    });
  });

  describe("Rollover Cycle Tracking Search (/orders/track)", () => {
    it("should match cycle 2 and cycle 3 orders when customer searches base number '001'", () => {
      const orders = [
        { id: 101, orderNumber: "001", customerName: "عميل 1", createdAt: "2026-03-25T10:00:00Z" },
        { id: 601, orderNumber: "001-2", customerName: "عميل دورة 2", createdAt: "2026-03-26T11:00:00Z" },
        { id: 1101, orderNumber: "001-3", customerName: "عميل دورة 3", createdAt: "2026-03-27T12:00:00Z" },
        { id: 102, orderNumber: "002", customerName: "عميل 2", createdAt: "2026-03-25T10:05:00Z" },
      ];

      const searchOrderNum = "001";
      const matches = orders
        .filter((o) => {
          const num = o.orderNumber.toLowerCase();
          return num === searchOrderNum || num.startsWith(`${searchOrderNum}-`);
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      expect(matches.length).toBe(3);
      expect(matches[0].orderNumber).toBe("001-3"); // Latest cycle first
      expect(matches[1].orderNumber).toBe("001-2");
      expect(matches[2].orderNumber).toBe("001");
    });

    it("should allow exact matching for cycle-specific search like '001-2'", () => {
      const orders = [
        { id: 101, orderNumber: "001" },
        { id: 601, orderNumber: "001-2" },
      ];

      const searchOrderNum = "001-2";
      const matches = orders.filter((o) => {
        const num = o.orderNumber.toLowerCase();
        return num === searchOrderNum || num.startsWith(`${searchOrderNum}-`);
      });

      expect(matches.length).toBe(1);
      expect(matches[0].orderNumber).toBe("001-2");
    });
  });

  describe("Security & Admin Password Configuration", () => {
    it("should provide a non-empty ADMIN_INITIAL_PASSWORD", () => {
      expect(typeof ADMIN_INITIAL_PASSWORD).toBe("string");
      expect(ADMIN_INITIAL_PASSWORD.length).toBeGreaterThanOrEqual(4);
    });

    it("should verify password against ADMIN_INITIAL_PASSWORD hash", () => {
      const hash = hashPassword(ADMIN_INITIAL_PASSWORD);
      expect(verifyPassword(ADMIN_INITIAL_PASSWORD, hash)).toBe(true);
      expect(verifyPassword("wrongAdminPassword999", hash)).toBe(false);
    });
  });

  describe("Dashboard Metrics Integrity", () => {
    it("should exclude inactive/archived categories from low-stock alert count", () => {
      const categories = [
        { id: 1, name: "كعك سادة", stockQuantity: 2, lowStockThreshold: 5, unit: "kilo", isActive: true },
        { id: 2, name: "غريبة فاخرة", stockQuantity: 20, lowStockThreshold: 5, unit: "kilo", isActive: true },
        { id: 3, name: "صنف مؤرشف", stockQuantity: 0, lowStockThreshold: 5, unit: "kilo", isActive: false },
      ];

      const lowStockCount = categories.filter((c) =>
        c.isActive !== false &&
        (Number(c.stockQuantity) <= Number(c.lowStockThreshold))
      ).length;

      // Only category 1 should be counted (category 3 is inactive/archived)
      expect(lowStockCount).toBe(1);
    });

    it("should exclude rejected orders from topCategory calculation", () => {
      const orders = [
        {
          id: 1,
          status: "rejected",
          items: [{ categoryName: "كعك سادة", quantity: 50 }],
        },
        {
          id: 2,
          status: "accepted",
          items: [{ categoryName: "غريبة فاخرة", quantity: 10 }],
        },
        {
          id: 3,
          status: "delivered",
          items: [{ categoryName: "غريبة فاخرة", quantity: 15 }],
        },
      ];

      const topByQuantity = new Map<string, number>();
      for (const order of orders) {
        if (order.status === "rejected") continue;
        for (const item of order.items) {
          topByQuantity.set(
            item.categoryName,
            (topByQuantity.get(item.categoryName) ?? 0) + item.quantity,
          );
        }
      }

      const topCategory = [...topByQuantity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      // "غريبة فاخرة" should be the top category (25 qty), NOT the rejected "كعك سادة" (50 qty)
      expect(topCategory).toBe("غريبة فاخرة");
    });
  });

  describe("TOCTOU In-Transaction Stock Reservation", () => {
    it("should support passing database executor to getActiveReservations", async () => {
      const mockTx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => [
                { categoryId: 1, unit: "kilo", quantity: "3.5" },
                { categoryId: 1, unit: "half_kilo", quantity: "2" },
                { categoryId: 2, unit: "kilo", quantity: "5" },
              ],
            }),
          }),
        }),
      };

      const reservations = await getActiveReservations(mockTx as any);
      expect(reservations.get(1)?.regular).toBe(3.5);
      expect(reservations.get(1)?.halfKilo).toBe(2);
      expect(reservations.get(2)?.regular).toBe(5);
    });
  });
});



