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

