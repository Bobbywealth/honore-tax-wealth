import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  clearFailedLogins,
  createSession,
  ensureBootstrapAdmin,
  ensureBootstrapClient,
  hashPassword,
  isLockedOut,
  normalizeEmail,
  recordFailedLogin,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Credential stuffing guard: 8 attempts per IP per 15 minutes, stored in
// Postgres so it is shared across instances and survives the cold starts a
// free instance performs constantly. Successful logins do not consume quota,
// so a legitimate user who mistypes twice is not locked out by an attacker
// sharing their egress IP.
const MAX_FAIL = 8;
const WINDOW_SECONDS = 900;
const MAX_BODY_BYTES = 2048;

function clientIp(request: Request): string {
  const fwd = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}

const hashSalt = process.env.LOG_SALT ?? "";
async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${hashSalt}|${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function logEvent(event: string, fields: Record<string, unknown>) {
  // Never log the submitted address or password.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

// Verified against when no account matches, so a missing account and a wrong
// password take indistinguishable time.
let decoyHash: string | null = null;
async function decoy(): Promise<string> {
  if (!decoyHash) decoyHash = await hashPassword(randomDecoyInput());
  return decoyHash;
}
function randomDecoyInput(): string {
  return "decoy-password-value-not-used";
}

const schema = z.object({
  email: z.string().trim().email("email").max(180, "email"),
  password: z.string().min(1, "password").max(200, "password"),
  /**
   * Which portal the person is trying to enter. Optional so existing callers
   * keep working; when present it is enforced BEFORE a session or an MFA
   * challenge is issued, so a client cannot use the agent entry point (and an
   * agent cannot use the client one) even with valid credentials. This is a
   * real separation, not a UI distinction.
   */
  audience: z.enum(["client", "agent"]).optional(),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const iph = await ipHash(ip);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    logEvent("auth.login.rejected", { iph, reason: "body_too_large" });
    return Response.json({ ok: false, error: "invalid_credentials" }, { status: 413 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    logEvent("auth.login.rejected", { iph, reason: "malformed" });
    return Response.json({ ok: false, error: "invalid_credentials" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    await ensureBootstrapAdmin();
    await ensureBootstrapClient();

    const rate = await consumeRateLimit(`login:${iph}`, MAX_FAIL, WINDOW_SECONDS);
    if (!rate.allowed) {
      logEvent("auth.login.rate_limited", { iph });
      return Response.json(
        { ok: false, error: "too_many_attempts" },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
      );
    }

    const email = normalizeEmail(parsed.email);
    const rows = await getDb()
      .select({ id: users.id, passwordHash: users.passwordHash, role: users.role, deactivatedAt: users.deactivatedAt, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const account = rows[0];

    // Deactivated accounts must be rejected even with the correct password —
    // a soft "remove" sets the password hash to a known dummy, but the
    // deactivatedAt check makes that intent explicit.
    if (account?.deactivatedAt) {
      logEvent("auth.login.deactivated", { userId: account.id });
      return Response.json({ ok: false, error: "account_deactivated" }, { status: 403 });
    }

    // Account-level lockout, persisted so it survives a cold start and
    // applies across instances.
    const locked = account ? await isLockedOut(account.id) : false;
    const ok = locked
      ? false
      : await verifyPassword(parsed.password, account?.passwordHash ?? (await decoy()));

    if (!account || !ok) {
      if (account) await recordFailedLogin(account.id);
      logEvent("auth.login.failed", { iph, locked });
      // Deliberately identical to the unknown-account response.
      return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    await clearFailedLogins(account.id);
    // A valid sign-in clears this caller's quota so their own typos do not
    // accumulate against them.
    await resetRateLimit(`login:${iph}`);

    // Portal separation. Checked only after the credential is proven so this
    // cannot be used to probe which addresses hold agent accounts, and before
    // any session or MFA challenge exists so the wrong-portal user never gets
    // a foothold.
    const isAgentRole = account.role !== "client";
    if (parsed.audience === "agent" && !isAgentRole) {
      logEvent("auth.login.wrong_portal", { iph, role: account.role, audience: "agent" });
      return Response.json(
        { ok: false, error: "wrong_portal", audience: "client" },
        { status: 403 },
      );
    }
    if (parsed.audience === "client" && isAgentRole) {
      logEvent("auth.login.wrong_portal", { iph, role: account.role, audience: "client" });
      return Response.json(
        { ok: false, error: "wrong_portal", audience: "agent" },
        { status: 403 },
      );
    }

    // MFA gate: password verified, but the account requires a second factor.
    // Issue a short-lived challenge token instead of a session.
    if (account.mfaEnabled) {
      const { mintMfaToken } = await import("@/lib/mfa");
      logEvent("auth.login.mfa_required", { iph, role: account.role });
      return Response.json({ ok: false, mfaRequired: true, mfaToken: mintMfaToken(account.id) });
    }

    // Staff MFA requirement: admins can force every agent/admin to enroll.
    // They still get a session, but the client redirects them to enroll and
    // protected layouts keep redirecting until MFA is enabled.
    let mfaEnrollmentRequired = false;
    if (account.role !== "client") {
      const { mfaRequiredForStaff } = await import("@/lib/settings");
      mfaEnrollmentRequired = await mfaRequiredForStaff();
    }

    const { token, expires } = await createSession(account.id, {
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipHash: iph,
    });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
    logEvent("auth.login.success", { iph, role: account.role });
    return Response.json({ ok: true, role: account.role, mfaEnrollmentRequired });
  } catch (err) {
    // Never log the submitted email or password. err.message gives the real
    // reason (e.g. "column \"deactivated_at\" does not exist") so future
    // 500s are diagnosable from the logs without exposing credentials.
    logEvent("auth.login.error", {
      iph,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}