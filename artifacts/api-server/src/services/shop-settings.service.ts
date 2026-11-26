import { db, shopSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureDatabaseSchema } from "./db-init.service";
import {
  hashPassword,
  verifyPassword,
  type RateLimitEntry,
} from "./staff-auth.service";

export const DELIVERED_OVERRIDE_KEY = "delivered_order_override_password_hash";

export const fallbackShopSettings = new Map<
  string,
  { value: string; updatedAt: string }
>();

export const overrideRateLimits = new Map<string, RateLimitEntry>();

export class OverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverrideValidationError";
  }
}

export async function getOverridePasswordStatus(): Promise<{
  isConfigured: boolean;
  updatedAt: string | null;
}> {
  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const [row] = await db
        .select({
          updatedAt: shopSettingsTable.updatedAt,
        })
        .from(shopSettingsTable)
        .where(eq(shopSettingsTable.key, DELIVERED_OVERRIDE_KEY))
        .limit(1);

      if (!row) {
        return { isConfigured: false, updatedAt: null };
      }
      return {
        isConfigured: true,
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : String(row.updatedAt),
      };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  const mem = fallbackShopSettings.get(DELIVERED_OVERRIDE_KEY);
  return {
    isConfigured: Boolean(mem?.value),
    updatedAt: mem?.updatedAt ?? null,
  };
}

export async function setOverridePassword(rawPassword: string): Promise<{
  isConfigured: true;
  updatedAt: string;
}> {
  const cleaned = String(rawPassword ?? "").trim();
  if (cleaned.length < 4 || cleaned.length > 64) {
    throw new OverrideValidationError(
      "كلمة مرور التعديل يجب أن تكون بين 4 و 64 حرفاً أو رقماً",
    );
  }

  const hashed = hashPassword(cleaned);
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      await db
        .insert(shopSettingsTable)
        .values({
          key: DELIVERED_OVERRIDE_KEY,
          value: hashed,
          updatedAt: nowDate,
        })
        .onConflictDoUpdate({
          target: shopSettingsTable.key,
          set: {
            value: hashed,
            updatedAt: nowDate,
          },
        });
      return { isConfigured: true, updatedAt: nowIso };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  fallbackShopSettings.set(DELIVERED_OVERRIDE_KEY, {
    value: hashed,
    updatedAt: nowIso,
  });
  return { isConfigured: true, updatedAt: nowIso };
}

export async function clearOverridePassword(): Promise<{
  isConfigured: false;
  updatedAt: null;
}> {
  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      await db
        .delete(shopSettingsTable)
        .where(eq(shopSettingsTable.key, DELIVERED_OVERRIDE_KEY));
      return { isConfigured: false, updatedAt: null };
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
    }
  }

  fallbackShopSettings.delete(DELIVERED_OVERRIDE_KEY);
  return { isConfigured: false, updatedAt: null };
}

export type OverrideVerificationResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "OVERRIDE_NOT_CONFIGURED"
        | "OVERRIDE_PASSWORD_REQUIRED"
        | "OVERRIDE_PASSWORD_INVALID";
      error: string;
    };

export async function verifyCollectedOrderOverride(
  rawPassword: string | undefined,
): Promise<OverrideVerificationResult> {
  let storedHash: string | null = null;

  if (process.env.DATABASE_URL) {
    try {
      await ensureDatabaseSchema();
      const [row] = await db
        .select({ value: shopSettingsTable.value })
        .from(shopSettingsTable)
        .where(eq(shopSettingsTable.key, DELIVERED_OVERRIDE_KEY))
        .limit(1);
      storedHash = row?.value ?? null;
    } catch (err) {
      if (!(process.env.NODE_ENV === "test" || process.env.VITEST)) {
        throw err;
      }
      storedHash = fallbackShopSettings.get(DELIVERED_OVERRIDE_KEY)?.value ?? null;
    }
  } else {
    storedHash = fallbackShopSettings.get(DELIVERED_OVERRIDE_KEY)?.value ?? null;
  }

  if (!storedHash) {
    return {
      ok: false,
      code: "OVERRIDE_NOT_CONFIGURED",
      error:
        "لم يقم مالك المحل بتعيين كلمة مرور تعديل الطلبات المستلمة بعد. تواصل مع الإدارة.",
    };
  }

  const candidate = typeof rawPassword === "string" ? rawPassword.trim() : "";
  if (!candidate) {
    return {
      ok: false,
      code: "OVERRIDE_PASSWORD_REQUIRED",
      error: "يرجى إدخال كلمة مرور المشرف لتعديل طلب تم استلامه.",
    };
  }

  if (!verifyPassword(candidate, storedHash)) {
    return {
      ok: false,
      code: "OVERRIDE_PASSWORD_INVALID",
      error: "كلمة مرور التعديل غير صحيحة.",
    };
  }

  return { ok: true };
}

export function appendOverrideAuditNote(
  existingNotes: string | null | undefined,
  actorLabel: string,
  reason?: string,
): string {
  const cleanActor = (actorLabel || "staff").trim().replace(/^@+/, "");
  const cleanReason = (reason || "").trim().slice(0, 200);
  const tag = cleanReason
    ? `[تعديل بعد الاستلام بواسطة @${cleanActor} — السبب: ${cleanReason}]`
    : `[تعديل بعد الاستلام بواسطة @${cleanActor}]`;
  const existing = (existingNotes || "").trim();
  return existing ? `${existing}\n${tag}` : tag;
}
