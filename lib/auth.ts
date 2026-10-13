import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientAccess,
  clients,
  emailVerificationTokens,
  engagements,
  invoices,
  passwordResetTokens,
  sessions,
  taxYears,
  users,
  type Role,
} from "@/db/schema";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;

export const SESSION_COOKIE = "honore_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export type { Role };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6) return false;
    const [scheme, n, r, p, saltB64, keyB64] = parts;
    if (scheme !== "scrypt") return false;

    // The stored parameters must match what hashPassword actually produces.
    // Deriving the work factor from the stored value would also let a tampered
    // row request a trivial cost factor.
    if (Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p) return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");

    // Validate the decoded structure BEFORE deriving anything.
    //
    // Node's base64 decoder silently skips characters outside the alphabet, so
    // the key segment of "scrypt$16384$8$1$!!!!$!!!!" decodes to an EMPTY
    // buffer. Using expected.length as the scrypt key length then asks for a
    // zero-length key, which returns a zero-length buffer, and
    // timingSafeEqual(empty, empty) evaluates to true — authenticating ANY
    // password against a corrupt stored hash. Failing closed on a malformed
    // structure is the only safe direction here.
    if (salt.length !== 16 || expected.length !== KEYLEN) return false;

    const actual = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Rejects anything that is not a long enough passphrase. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ipHash?: string },
): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await getDb()
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: expires,
      userAgent: meta?.userAgent?.slice(0, 300) ?? null,
      ipHash: meta?.ipHash ?? null,
    });
  return { token, expires };
}

export async function destroySession(token: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

/** Revokes every session for a user. Used on password change and logout-everywhere. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} is null`));
}

/**
 * Invalidates every session issued before now. Bumping this watermark is how
 * a password change logs out other devices without enumerating rows.
 */
export async function bumpSessionWatermark(userId: string): Promise<void> {
  await getDb().update(users).set({ sessionsValidFrom: new Date() }).where(eq(users.id, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
  // Phone is loaded on demand by pages that need it (settings profile, etc.).
  // The auth layer doesn't fetch it on every request by default because most
  // pages only need identity + role.
  phone?: string | null;
};

/**
 * Resolve the caller from the signed, HttpOnly session cookie.
 *
 * This reads no request header and no query parameter. The interim gate that
 * trusted an `oai-authenticated-user-id` header let anyone read every client's
 * name, email, phone and message with a single curl, so identity is derived
 * only from a server-side session row.
 *
 * Also enforces:
 *  - expiry
 *  - explicit revocation
 *  - the per-user watermark, so a password change ends older sessions
 *
 * Returns null for anonymous, expired, revoked, or malformed sessions.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({
      revokedAt: sessions.revokedAt,
      sessionsValidFrom: users.sessionsValidFrom,
      deactivatedAt: users.deactivatedAt,
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;
  // A deactivated user cannot open new sessions even if a stale token
  // remains in a browser — the team "remove" action flips this flag and
  // bumps session watermark in one transaction.
  if (row.deactivatedAt) return null;

  // A session created before the user's last password change is not valid.
  const created = await getDb()
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (created[0] && new Date(created[0].createdAt) < new Date(row.sessionsValidFrom)) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role as Role,
    displayName: row.displayName,
  };
}

/** Server-side authorization check. Returns the user when allowed, else null. */
export async function requireRole(...roles: Role[]): Promise<SessionUser | null> {
  const user = await currentUser();
  if (!user) return null;
  if (roles.length && !roles.includes(user.role)) return null;
  return user;
}

export async function isStaff(): Promise<boolean> {
  const user = await currentUser();
  return user?.role === "staff" || user?.role === "assistant" || user?.role === "admin";
}

/* ----------------------- Account lockout -------------------------- */

export async function recordFailedLogin(userId: string): Promise<void> {
  const rows = await getDb()
    .select({ failedLoginCount: users.failedLoginCount })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const count = (rows[0]?.failedLoginCount ?? 0) + 1;
  const lockUntil = count >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
  await getDb()
    .update(users)
    .set({ failedLoginCount: count, lockedUntil: lockUntil, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function isLockedOut(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const until = rows[0]?.lockedUntil;
  return !!until && new Date(until) > new Date();
}

/* ------------------- Password reset / verification ------------------ */

export async function issuePasswordReset(userId: string): Promise<string> {
  await getDb()
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), sql`${passwordResetTokens.usedAt} is null`));
  const token = randomBytes(32).toString("base64url");
  await getDb().insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return token;
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        sql`${passwordResetTokens.usedAt} is null`,
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return false;

  await getDb()
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  // Ending every other session is the point of a password reset.
  await revokeAllSessions(row.userId);
  await bumpSessionWatermark(row.userId);
  return true;
}

export async function issueEmailVerification(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb().insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  return token;
}

export async function consumeEmailVerification(token: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, hashToken(token)),
        sql`${emailVerificationTokens.usedAt} is null`,
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  await getDb()
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id));
  await getDb()
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  return true;
}

/* --------------------------- Bootstrap ----------------------------- */

async function ensureBootstrapUser(
  role: "admin" | "client",
  emailEnv: string,
  passwordEnv: string,
  displayName: string,
): Promise<void> {
  const email = process.env[emailEnv];
  const password = process.env[passwordEnv];
  if (!email || !password) return;
  if (passwordProblem(password)) {
    console.warn(`[auth] ${passwordEnv} rejected by policy; refusing to bootstrap`);
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  // If this exact email already exists with the requested role, leave it alone.
  const existing = await getDb()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (existing.length > 0) {
    if (existing[0].role !== role) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "auth.bootstrap_role_mismatch",
          email: normalizedEmail,
          existingRole: existing[0].role,
          requestedRole: role,
        }),
      );
    }
    return;
  }

  await getDb().insert(users).values({
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role,
    displayName,
    emailVerifiedAt: new Date(),
  });
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event: "auth.bootstrap_user_created", role, email: normalizedEmail }),
  );
}

/**
 * Create the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Runs only when no user with that email already exists, so it cannot resurrect
 * or alter an existing account. A no-op when the env vars are unset.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  await ensureBootstrapUser("admin", "ADMIN_EMAIL", "ADMIN_PASSWORD", "Site owner");
}

/**
 * Create a demo client from CLIENT_EMAIL / CLIENT_PASSWORD.
 *
 * Skipped if the email is already taken (regardless of role) or the env vars
 * are unset. Re-runs on every login attempt, so a cleared env var hides the
 * user from future bootstrap runs without affecting the existing record.
 */
export async function ensureBootstrapClient(): Promise<void> {
  await ensureBootstrapUser("client", "CLIENT_EMAIL", "CLIENT_PASSWORD", "Demo client");
  // The bootstrap user is now in the users table; look it up by email and seed their client.
  if (!process.env.DATABASE_URL) return;
  const email = normalizeEmail(process.env.CLIENT_EMAIL ?? "");
  if (!email) return;
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (rows[0]) await ensureClientDataFor(rows[0].id);
}

/**
 * For the bootstrap client, ensure there is a `clients` row linked to the
 * user via `clientAccess`, plus a sample engagement / taxYear / invoice so
 * the client dashboard has real rows to render on first sign-in.
 */
async function ensureClientDataFor(userId: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const access = await getDb()
      .select({ id: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, userId))
      .limit(1);
    if (access.length > 0) return;

    const [client] = await getDb()
      .insert(clients)
      .values({
        displayName: "Demo Client",
        legalName: "Demo Client LLC",
        email: "client@honoretaxwealth.com",
        entityType: "individual",
        status: "active",
      })
      .returning({ id: clients.id });
    if (!client) return;

    await getDb()
      .insert(clientAccess)
      .values({ userId, clientId: client.id });

    // A 2025 individual 1040 engagement so the dashboard has work to show
    const [eg] = await getDb()
      .insert(engagements)
      .values({
        clientId: client.id,
        name: "2025 individual tax return",
        serviceType: "tax_prep",
        status: "in_preparation",
        progressPercent: 35,
        internalNotes: "Bootstrapped demo data for the client dashboard.",
      })
      .returning({ id: engagements.id });

    if (eg) {
      const yearRow = await getDb()
        .insert(taxYears)
        .values({
          clientId: client.id,
          year: 2025,
          filingStatus: "in_progress",
          dueDate: new Date("2026-04-15T00:00:00-04:00"),
        })
        .returning({ id: taxYears.id });
      if (yearRow[0]) {
        // Best-effort invoice so the Invoices section isn't empty.
        await getDb()
          .insert(invoices)
          .values({
            clientId: client.id,
            number: "INV-2025-DEMO-001",
            status: "draft",
            currency: "USD",
            subtotal: "540.00",
            tax: "0.00",
            total: "540.00",
            dueAt: new Date("2026-04-15T00:00:00-04:00"),
          })
          .catch(() => {
            // number is unique; swallow dupes from a re-run
          });
      }
    }
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "auth.bootstrap_client_seeded", userId }));
  } catch (error) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "auth.bootstrap_client_seed_failed", userId, err: (error as Error).message }));
  }
}