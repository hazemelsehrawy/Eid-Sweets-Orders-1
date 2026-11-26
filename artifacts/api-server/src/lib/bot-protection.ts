import crypto from "crypto";
import type { Request } from "express";
import { SESSION_SECRET } from "../services/staff-auth.service";
import { extractClientIp } from "./ratelimit";

export const MIN_FORM_FILL_MS = 2_000;
export const MAX_FORM_TOKEN_AGE_MS = 2 * 60 * 60 * 1_000; // 2 hours

let missingTurnstileWarned = false;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

/**
 * Strips disallowed ASCII control characters and enforces bounded string length.
 */
export function sanitizeTextInput(
  value: unknown,
  maxLength: number,
  options?: { allowNewlines?: boolean },
): string {
  if (typeof value !== "string") return "";
  const controlPattern = options?.allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return value.replace(controlPattern, "").trim().slice(0, maxLength);
}

function signTimestampPayload(payload: string): string {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`form-token:${payload}`)
    .digest("hex");
}

/**
 * Issues an HMAC-SHA256 signed render timestamp token so the server can reject
 * instant bot submissions (< 2s after render) without storing session state.
 */
export function issueFormToken(nowMs: number = Date.now()): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${nowMs}.${nonce}`;
  const sig = signTimestampPayload(payload);
  return `${payload}.${sig}`;
}

export type FormTokenCheckResult =
  | { ok: true; elapsedMs: number }
  | {
      ok: false;
      code:
        | "FORM_TOKEN_MISSING"
        | "FORM_TOKEN_INVALID"
        | "FORM_TOO_FAST"
        | "FORM_TOKEN_EXPIRED";
      error: string;
    };

export function verifyFormToken(
  rawToken: unknown,
  nowMs: number = Date.now(),
  minDelayMs: number = MIN_FORM_FILL_MS,
): FormTokenCheckResult {
  if (typeof rawToken !== "string" || !rawToken.trim()) {
    return {
      ok: false,
      code: "FORM_TOKEN_MISSING",
      error: "رمز التحقق من النموذج مفقود. يرجى إعادة تحميل الصفحة والمحاولة.",
    };
  }

  const parts = rawToken.trim().split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      code: "FORM_TOKEN_INVALID",
      error: "رمز النموذج غير صالح.",
    };
  }

  const [tsStr, nonce, sig] = parts;
  const issuedAt = Number(tsStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0 || !/^[a-f0-9]{16}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(sig)) {
    return {
      ok: false,
      code: "FORM_TOKEN_INVALID",
      error: "رمز النموذج غير صالح.",
    };
  }

  const expectedSig = signTimestampPayload(`${tsStr}.${nonce}`);
  const actualBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return {
      ok: false,
      code: "FORM_TOKEN_INVALID",
      error: "تعذر التحقق من صحة النموذج.",
    };
  }

  const elapsedMs = nowMs - issuedAt;
  if (elapsedMs < minDelayMs) {
    return {
      ok: false,
      code: "FORM_TOO_FAST",
      error: "تم إرسال النموذج بسرعة غير طبيعية. يرجى الانتظار ثانيتين وإعادة المحاولة.",
    };
  }

  if (elapsedMs > MAX_FORM_TOKEN_AGE_MS) {
    return {
      ok: false,
      code: "FORM_TOKEN_EXPIRED",
      error: "انتهت صلاحية الجلسة الزمنية للنموذج. يرجى تحديث الصفحة.",
    };
  }

  return { ok: true, elapsedMs };
}

export type TurnstileCheckResult =
  | { ok: true; skipped?: boolean }
  | {
      ok: false;
      code: "TURNSTILE_REQUIRED" | "TURNSTILE_FAILED";
      error: string;
    };

/**
 * Verifies a Cloudflare Turnstile response token against Cloudflare's siteverify endpoint.
 * Fails gracefully with a one-time warning if TURNSTILE_SECRET_KEY is not configured.
 */
export async function verifyTurnstileToken(
  rawToken: unknown,
  remoteIp: string,
): Promise<TurnstileCheckResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (!missingTurnstileWarned && !isTestEnv()) {
      missingTurnstileWarned = true;
      console.warn(
        "⚠️ [BOT PROTECTION NOTICE]: TURNSTILE_SECRET_KEY is not set. Turnstile verification is bypassed until configured.",
      );
    }
    return { ok: true, skipped: true };
  }

  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) {
    return {
      ok: false,
      code: "TURNSTILE_REQUIRED",
      error: "يرجى إتمام التحقق الأمني قبل الإرسال.",
    };
  }

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (remoteIp && remoteIp !== "unknown") {
      form.set("remoteip", remoteIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "TURNSTILE_FAILED",
        error: "تعذر التحقق الأمني من الطلب. يرجى المحاولة مرة أخرى.",
      };
    }

    const payload = (await response.json()) as { success?: boolean };
    if (payload?.success === true) {
      return { ok: true };
    }

    return {
      ok: false,
      code: "TURNSTILE_FAILED",
      error: "فشل التحقق الأمني. يرجى تحديث التحقق والمحاولة مرة أخرى.",
    };
  } catch {
    return {
      ok: false,
      code: "TURNSTILE_FAILED",
      error: "تعذر الاتصال بخدمة التحقق الأمني. يرجى إعادة المحاولة.",
    };
  }
}

export type PublicFormCheckResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

/**
 * Runs layered bot protection on public form submissions before any DB work:
 * 1. Honeypot check (`_hp` / `website`)
 * 2. Signed render timestamp >= 2s (`_ft`)
 * 3. Cloudflare Turnstile verification (`turnstileToken` / `cf-turnstile-response`)
 */
export async function verifyPublicFormSubmission(
  req: Request,
  options?: { requireTurnstile?: boolean; minDelayMs?: number },
): Promise<PublicFormCheckResult> {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  // 1. Honeypot check — always enforced (even in automated tests)
  const hpCandidates = [body._hp, body.website, body.company_website];
  for (const val of hpCandidates) {
    if (typeof val === "string" && val.trim().length > 0) {
      return {
        ok: false,
        status: 400,
        code: "HONEYPOT_TRIGGERED",
        error: "تعذر معالجة الطلب.",
      };
    }
  }

  // Allow existing integration tests to focus on domain logic unless explicitly testing bot checks
  if (isTestEnv() && req.headers["x-test-enforce-bot"] !== "1") {
    return { ok: true };
  }

  // 2. Signed 2-second minimum fill check
  const formToken =
    typeof body._ft === "string"
      ? body._ft
      : typeof req.headers["x-form-token"] === "string"
      ? req.headers["x-form-token"]
      : undefined;

  const timingCheck = verifyFormToken(formToken, Date.now(), options?.minDelayMs ?? MIN_FORM_FILL_MS);
  if (!timingCheck.ok) {
    return {
      ok: false,
      status: 400,
      code: timingCheck.code,
      error: timingCheck.error,
    };
  }

  // 3. Cloudflare Turnstile verification (when secret key is set)
  if (options?.requireTurnstile !== false) {
    const turnstileToken = body.turnstileToken ?? body["cf-turnstile-response"];
    const turnstileCheck = await verifyTurnstileToken(turnstileToken, extractClientIp(req));
    if (!turnstileCheck.ok) {
      return {
        ok: false,
        status: 403,
        code: turnstileCheck.code,
        error: turnstileCheck.error,
      };
    }
  }

  return { ok: true };
}
