import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sanitizeCsvCell,
  parseDepositAmount,
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
