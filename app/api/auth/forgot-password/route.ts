import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { issuePasswordReset, normalizeEmail } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

// Deliberately identical for every outcome, so this endpoint cannot be used to
// discover which addresses have accounts.
const GENERIC = { ok: true, message: "If that address has an account, a reset link is on its way." };

const schema = z.object({
  email: z.string().trim().email("email").max(180, "email"),
});

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(GENERIC, { status: 200 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return Response.json(GENERIC, { status: 200 });
  }

  try {
    await ensureMigrated();

    // Per-address limit, keyed by a hash so the address itself is not stored
    // in the counter table.
    const key = `pwreset:${(await hashFor(parsed.email)).slice(0, 24)}`;
    const limit = await consumeRateLimit(key, 3, 3600);
    if (!limit.allowed) {
      return Response.json(
        { ok: false, error: "too_many_attempts" },
        { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
      );
    }

    const rows = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, normalizeEmail(parsed.email)))
      .limit(1);
    const account = rows[0];

    if (account) {
      const token = await issuePasswordReset(account.id);
      const mail = await sendPasswordResetEmail(account.email, token);
      // Never log the address or the token.
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "auth.reset_requested",
          sent: mail.ok,
        }),
      );
    } else {
      console.log(
        JSON.stringify({ ts: new Date().toISOString(), event: "auth.reset_requested", sent: false }),
      );
    }

    return Response.json(GENERIC, { status: 200 });
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "auth.reset_error",
        reason: err instanceof Error ? err.name : "unknown",
      }),
    );
    return Response.json(GENERIC, { status: 200 });
  }
}

async function hashFor(value: string): Promise<string> {
  const salt = process.env.LOG_SALT ?? "";
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}|reset|${normalizeEmail(value)}`),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}