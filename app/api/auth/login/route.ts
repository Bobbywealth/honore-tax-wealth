import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import {
  SESSION_COOKIE,
  createSession,
  ensureBootstrapAdmin,
  hashPassword,
  normalizeEmail,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Credential stuffing guard: 8 attempts per IP per 15 minutes. Successful
// logins do not count against the bucket so a legitimate user who mistypes
// twice is not locked out by an attacker sharing their egress IP.
const buckets = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAIL = 8;
const MAX_BODY_BYTES = 2048;

function clientIp(request: Request): string {
  const fwd = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}

function noteFailure(ip: string): boolean {
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAIL) {
    buckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  buckets.set(ip, recent);
  return false;
}

function clearFailures(ip: string): void {
  buckets.delete(ip);
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

  if (noteFailure(ip)) {
    logEvent("auth.login.rate_limited", { iph });
    return Response.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
  }

  try {
    await ensureMigrated();
    await ensureBootstrapAdmin();

    const email = normalizeEmail(parsed.email);
    const rows = await getDb()
      .select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const account = rows[0];

    const ok = await verifyPassword(parsed.password, account?.passwordHash ?? (await decoy()));
    if (!account || !ok) {
      logEvent("auth.login.failed", { iph });
      // Deliberately identical to the unknown-account response.
      return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }

    clearFailures(ip);
    const { token, expires } = await createSession(account.id);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
    logEvent("auth.login.success", { iph, role: account.role });
    return Response.json({ ok: true, role: account.role });
  } catch (err) {
    logEvent("auth.login.error", { iph, reason: err instanceof Error ? err.name : "unknown" });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}