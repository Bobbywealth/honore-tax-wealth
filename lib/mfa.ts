import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

/**
 * TOTP (RFC 6238) multi-factor authentication.
 *
 * Implemented with Node's built-in crypto — no external dependencies.
 * Secrets are encrypted at rest with AES-256-GCM using MFA_SECRET_KEY
 * (falls back to a derived key in dev; set it in production).
 *
 * Backup codes are single-use: each is a random 8-char alphanumeric string,
 * stored as SHA-256 hashes. Verification consumes (removes) the code.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // accept ±1 step for clock skew

function encKey(): Buffer {
  const raw = process.env.MFA_SECRET_KEY ?? "dev-only-mfa-key-change-in-production!!";
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${ct.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptSecret(enc: string): string {
  const [ivB64, ctB64, tagB64] = enc.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("mfa: malformed secret");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

// Base32 (RFC 4648, no padding) for authenticator-app compatibility.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("mfa: invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new TOTP secret (base32, 160 bits). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: bigint): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const hmac = createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

function counterFor(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000 / STEP_SECONDS));
}

/** Current TOTP code (for testing; never expose to clients). */
export function currentCode(secretB32: string, at = new Date()): string {
  return hotp(base32Decode(secretB32), counterFor(at));
}

/**
 * Verify a TOTP code with ±1 step clock-skew tolerance.
 * Constant-time comparison to avoid timing oracles.
 */
export function verifyTotp(secretB32: string, code: string, at = new Date()): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretB32);
  } catch {
    return false;
  }
  const base = counterFor(at);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const expected = hotp(secret, base + BigInt(d));
    if (timingSafeEqual(expected, clean)) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** otpauth:// URL for manual entry or QR generation. */
export function otpauthUrl(secretB32: string, accountName: string, issuer = "I Honore Tax & Wealth"): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Generate 8 single-use backup codes (plaintext returned once). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < count; i++) {
    let c = "";
    for (let j = 0; j < 8; j++) c += chars[randomBytes(1)[0] % chars.length];
    codes.push(`${c.slice(0, 4)}-${c.slice(4)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.replace(/-/g, "").toUpperCase()).digest("hex");
}

// ---------------------------------------------------------------------------
// Short-lived MFA challenge tokens (stateless, HMAC-signed, 5-min expiry).
// Minted after password verification; exchanged for a session by the
// challenge route once the TOTP code checks out.
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function challengeKey(): Buffer {
  const raw = process.env.MFA_SECRET_KEY ?? "dev-only-mfa-key-change-in-production!!";
  return createHash("sha256").update(`mfa-challenge|${raw}`).digest();
}

export function mintMfaToken(userId: string): string {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", challengeKey()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyMfaToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = createHmac("sha256", challengeKey()).update(`${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return userId;
}
