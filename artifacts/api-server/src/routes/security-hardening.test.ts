import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import {
  extractClientIp,
  resetMemoryRateLimitStore,
} from "../lib/ratelimit";
import {
  issueFormToken,
  verifyFormToken,
  verifyTurnstileToken,
  sanitizeTextInput,
} from "../lib/bot-protection";
import { isBlockedApiUserAgent } from "../middlewares/security";

describe("Security Hardening & Anti-Bot Suite", () => {
  beforeEach(() => {
    resetMemoryRateLimitStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("extracts client IP from first x-forwarded-for hop with safe fallbacks", () => {
    const req1 = {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" },
      ip: "10.0.0.2",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    expect(extractClientIp(req1)).toBe("203.0.113.5");

    const req2 = {
      headers: {},
      ip: "::ffff:198.51.100.7",
      socket: { remoteAddress: "::1" },
    } as any;
    expect(extractClientIp(req2)).toBe("198.51.100.7");
  });

  it("identifies empty or known malicious/scraper User-Agents while sparing browsers & search crawlers", () => {
    expect(isBlockedApiUserAgent(undefined)).toBe(true);
    expect(isBlockedApiUserAgent("")).toBe(true);
    expect(isBlockedApiUserAgent("curl/8.4.0")).toBe(true);
    expect(isBlockedApiUserAgent("python-requests/2.31.0")).toBe(true);
    expect(isBlockedApiUserAgent("Scrapy/2.11 (+https://scrapy.org)")).toBe(true);
    expect(isBlockedApiUserAgent("GPTBot/1.0")).toBe(true);

    expect(
      isBlockedApiUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBlockedApiUserAgent(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(false);
    expect(
      isBlockedApiUserAgent(
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ),
    ).toBe(false);
  });

  it("blocks scraper User-Agents with 403 on API routes but allows /healthz and browsers", async () => {
    const blockedRes = await request(app)
      .get("/categories")
      .set("x-test-enforce-ua", "1")
      .set("User-Agent", "python-requests/2.31.0");
    expect(blockedRes.status).toBe(403);

    const emptyUaRes = await request(app)
      .get("/categories")
      .set("x-test-enforce-ua", "1")
      .set("User-Agent", "");
    expect(emptyUaRes.status).toBe(403);

    const healthzRes = await request(app)
      .get("/healthz")
      .set("x-test-enforce-ua", "1")
      .set("User-Agent", "curl/8.4.0");
    expect(healthzRes.status).toBe(200);

    const browserRes = await request(app)
      .get("/categories")
      .set("x-test-enforce-ua", "1")
      .set(
        "User-Agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      );
    expect(browserRes.status).toBe(200);
  });

  it("enforces sensitive endpoint rate limit (5 req/min) and sets Retry-After on 429", async () => {
    const testIp = "198.51.100.77";
    for (let i = 0; i < 5; i++) {
      const okRes = await request(app)
        .get("/orders/track")
        .set("x-test-enforce-ratelimit", "1")
        .set("x-forwarded-for", testIp)
        .query({ orderNumber: "NON-EXISTENT-999" });
      expect(okRes.status).toBe(200);
    }

    const blocked = await request(app)
      .get("/orders/track")
      .set("x-test-enforce-ratelimit", "1")
      .set("x-forwarded-for", testIp)
      .query({ orderNumber: "NON-EXISTENT-999" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("enforces general API rate limit (30 req/10s per IP) with 429 + Retry-After", async () => {
    const testIp = "198.51.100.88";
    for (let i = 0; i < 30; i++) {
      const okRes = await request(app)
        .get("/categories")
        .set("x-test-enforce-ratelimit", "1")
        .set("x-forwarded-for", testIp);
      expect(okRes.status).toBe(200);
    }

    const blocked = await request(app)
      .get("/categories")
      .set("x-test-enforce-ratelimit", "1")
      .set("x-forwarded-for", testIp);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("rejects unsupported HTTP methods on known API endpoints with 405 Method Not Allowed", async () => {
    const delTrack = await request(app).delete("/orders/track");
    expect(delTrack.status).toBe(405);
    expect(delTrack.headers["allow"]).toContain("GET");

    const putCategories = await request(app).put("/categories").send({});
    expect(putCategories.status).toBe(405);
    expect(putCategories.headers["allow"]).toContain("GET");
    expect(putCategories.headers["allow"]).toContain("POST");

    const unknownRes = await request(app).get("/definitely-missing-endpoint-xyz");
    expect(unknownRes.status).toBe(404);
  });

  it("rejects honeypot-filled submissions on public order, login, and register forms", async () => {
    const orderRes = await request(app).post("/orders").send({
      customerName: "Spam Bot",
      phoneNumber: "01012345678",
      pickupDate: "2026-04-15",
      pickupTime: "11:00",
      items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
      website: "https://spam.example",
    });
    expect(orderRes.status).toBe(400);
    expect(orderRes.body.code).toBe("HONEYPOT_TRIGGERED");

    const regRes = await request(app).post("/staff/register").send({
      fullName: "Bot User",
      username: "bot_user",
      password: "Password123!",
      _hp: "filled-by-bot",
    });
    expect(regRes.status).toBe(400);
    expect(regRes.body.code).toBe("HONEYPOT_TRIGGERED");

    const loginRes = await request(app).post("/staff/login").send({
      username: "admin",
      password: "Password123!",
      website: "http://evil.bot",
    });
    expect(loginRes.status).toBe(400);
    expect(loginRes.body.code).toBe("HONEYPOT_TRIGGERED");
  });

  it("enforces signed timestamp token (>= 2s form fill delay) on public submissions", async () => {
    const now = Date.now();
    const freshToken = issueFormToken(now);
    const oldEnoughToken = issueFormToken(now - 3500);

    // Direct unit checks
    const tooFast = verifyFormToken(freshToken, now + 500);
    expect(tooFast.ok).toBe(false);
    if (!tooFast.ok) expect(tooFast.code).toBe("FORM_TOO_FAST");

    const tampered = verifyFormToken(`${freshToken.slice(0, -4)}0000`, now + 5000);
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.code).toBe("FORM_TOKEN_INVALID");

    expect(verifyFormToken(oldEnoughToken, now).ok).toBe(true);

    // End-to-end check on POST /staff/login
    const tokenRes = await request(app).get("/security/form-token");
    expect(tokenRes.status).toBe(200);
    expect(typeof tokenRes.body.token).toBe("string");
    expect(tokenRes.headers["cache-control"]).toBe("no-store");

    const fastAttempt = await request(app)
      .post("/staff/login")
      .set("x-test-enforce-bot", "1")
      .send({
        username: "admin",
        password: "wrong-password",
        _ft: tokenRes.body.token,
      });
    expect(fastAttempt.status).toBe(400);
    expect(fastAttempt.body.code).toBe("FORM_TOO_FAST");

    const validAgedRes = await request(app)
      .post("/staff/login")
      .set("x-test-enforce-bot", "1")
      .send({
        username: "admin",
        password: "wrong-password",
        _ft: issueFormToken(Date.now() - 3000),
      });
    // Passed bot checks cleanly and reached credential verification -> 401
    expect(validAgedRes.status).toBe(401);
  });

  it("verifies Cloudflare Turnstile tokens via siteverify when TURNSTILE_SECRET_KEY is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";

    const missingToken = await verifyTurnstileToken("", "203.0.113.10");
    expect(missingToken.ok).toBe(false);
    if (!missingToken.ok) expect(missingToken.code).toBe("TURNSTILE_REQUIRED");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const rejected = await verifyTurnstileToken("bad-token", "203.0.113.10");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("TURNSTILE_FAILED");

    const accepted = await verifyTurnstileToken("valid-token", "203.0.113.10");
    expect(accepted).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("sanitizes control characters, enforces max input lengths, and sets Cache-Control properly", async () => {
    expect(sanitizeTextInput("  hello\u0000\u0007 world  ", 10)).toBe("hello worl");

    const overlongNotesRes = await request(app).post("/orders").send({
      customerName: "عميل عادي",
      phoneNumber: "01012345678",
      pickupDate: "2026-04-15",
      pickupTime: "11:00",
      notes: "أ".repeat(501),
      items: [{ categoryId: 1, quantity: 1, unit: "kilo" }],
    });
    expect(overlongNotesRes.status).toBe(400);

    const publicCatRes = await request(app).get("/categories");
    expect(publicCatRes.status).toBe(200);
    expect(publicCatRes.headers["cache-control"]).toContain("s-maxage=10");
    expect(publicCatRes.headers["x-content-type-options"]).toBe("nosniff");
  });
});
