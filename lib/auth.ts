import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, type Role } from "@/db/schema";

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
    const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
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

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await getDb().insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt: expires });
  return { token, expires };
}

export async function destroySession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function purgeExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
};

/**
 * Resolve the caller from the signed, HttpOnly session cookie.
 *
 * This deliberately reads no request header and no query parameter. The
 * interim gate that trusted an `oai-authenticated-user-id` header let anyone
 * read every client's name, email, phone and message with a single curl, so
 * access is now derived only from a server-side session row.
 *
 * Returns null for anonymous, expired, or malformed sessions.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({
      expiresAt: sessions.expiresAt,
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
  if (!row) return null;
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

/**
 * Create the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Runs only when the users table is empty, so it cannot resurrect or alter an
 * existing account. A no-op when the env vars are unset.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    console.warn("[auth] ADMIN_PASSWORD is shorter than 12 characters; refusing to bootstrap");
    return;
  }

  const existing = await getDb().select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  await getDb().insert(users).values({
    email: normalizeEmail(email),
    passwordHash: await hashPassword(password),
    role: "admin",
    displayName: "Site owner",
    emailVerifiedAt: new Date(),
  });
  console.log("[auth] bootstrap administrator created");
}