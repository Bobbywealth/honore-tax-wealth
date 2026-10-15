import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decryptSecret, verifyTotp } from "@/lib/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(6).max(10) });

/**
 * Disable MFA. Requires a current TOTP code as proof of possession —
 * prevents an attacker with a hijacked session from silently removing the
 * second factor.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const rows = await db
      .select({ totpSecret: users.totpSecret, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const row = rows[0];
    if (!row?.mfaEnabled || !row.totpSecret) {
      return Response.json({ ok: false, error: "not_enabled" }, { status: 400 });
    }

    let secret: string;
    try {
      secret = decryptSecret(row.totpSecret);
    } catch {
      return Response.json({ ok: false, error: "server_error" }, { status: 500 });
    }
    if (!verifyTotp(secret, payload.code)) {
      return Response.json({ ok: false, error: "invalid_code" }, { status: 400 });
    }

    await db
      .update(users)
      .set({
        mfaEnabled: false,
        totpSecret: null,
        mfaBackupCodes: null,
        mfaEnrolledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await audit(user, "mfa.disabled", "user", user.id, {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
