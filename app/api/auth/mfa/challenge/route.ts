import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import {
  SESSION_COOKIE,
  clearFailedLogins,
  createSession,
  isLockedOut,
  recordFailedLogin,
  sessionCookieOptions,
} from "@/lib/auth";
import { consumeRateLimit, resetRateLimit, saltedIpKey } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { decryptSecret, hashBackupCode, verifyMfaToken, verifyTotp } from "@/lib/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAIL = 8;
const WINDOW_SECONDS = 900;

function clientIp(request: Request): string {
  const fwd = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}
const hashSalt = process.env.LOG_SALT ?? "";
async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${hashSalt}|${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

const schema = z.object({
  mfaToken: z.string().min(10).max(300),
  code: z.string().trim().min(6).max(12),
});

/**
 * Complete an MFA login: verify the TOTP code (or a single-use backup
 * code) against the challenge token minted after password verification.
 * Issues the session cookie on success.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const iph = await ipHash(ip);

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const userId = verifyMfaToken(payload.mfaToken);
  if (!userId) {
    return Response.json({ ok: false, error: "invalid_or_expired" }, { status: 401 });
  }

  try {
    await ensureMigrated();
    const rate = await consumeRateLimit(saltedIpKey("mfa", iph), MAX_FAIL, WINDOW_SECONDS);
    if (!rate.allowed) {
      return Response.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        role: users.role,
        totpSecret: users.totpSecret,
        mfaEnabled: users.mfaEnabled,
        mfaBackupCodes: users.mfaBackupCodes,
        deactivatedAt: users.deactivatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const account = rows[0];
    if (!account || !account.mfaEnabled || account.deactivatedAt) {
      return Response.json({ ok: false, error: "invalid_request" }, { status: 401 });
    }
    if (await isLockedOut(account.id)) {
      return Response.json({ ok: false, error: "account_locked" }, { status: 403 });
    }

    const code = payload.code.replace(/[\s-]/g, "");
    let ok = false;
    let usedBackup = false;

    // Try TOTP first.
    if (/^\d{6}$/.test(code) && account.totpSecret) {
      try {
        ok = verifyTotp(decryptSecret(account.totpSecret), code);
      } catch {
        ok = false;
      }
    }
    // Then single-use backup codes.
    if (!ok && /^[A-Z0-9]{8}$/i.test(code) && account.mfaBackupCodes?.length) {
      const hashed = hashBackupCode(code);
      const idx = account.mfaBackupCodes.indexOf(hashed);
      if (idx !== -1) {
        ok = true;
        usedBackup = true;
        const remaining = [...account.mfaBackupCodes];
        remaining.splice(idx, 1);
        await db.update(users).set({ mfaBackupCodes: remaining }).where(eq(users.id, userId));
      }
    }

    if (!ok) {
      await recordFailedLogin(account.id);
      logEvent("auth.mfa.failed", { iph });
      return Response.json({ ok: false, error: "invalid_code" }, { status: 401 });
    }

    await clearFailedLogins(account.id);
    await resetRateLimit(saltedIpKey("mfa", iph));
    const { token, expires } = await createSession(account.id, {
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipHash: iph,
    });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
    logEvent("auth.mfa.success", { iph, role: account.role, usedBackup });
    return Response.json({ ok: true, role: account.role, backupCodesLeft: account.mfaBackupCodes?.length ?? 0 });
  } catch (err) {
    logEvent("auth.mfa.error", { iph, reason: err instanceof Error ? err.message : "unknown" });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
