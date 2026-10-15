import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
  verifyTotp,
} from "@/lib/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(6).max(10) });

/**
 * Confirm MFA enrollment: verify a TOTP code against the pending secret,
 * then enable MFA and issue single-use backup codes.
 *
 * Backup codes are returned ONCE as plaintext; only SHA-256 hashes are
 * stored. The user must save them now.
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
    if (!row?.totpSecret) {
      return Response.json({ ok: false, error: "no_pending_secret" }, { status: 400 });
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

    const codes = generateBackupCodes();
    await db
      .update(users)
      .set({
        mfaEnabled: true,
        mfaBackupCodes: codes.map(hashBackupCode),
        mfaEnrolledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await audit(user, "mfa.enabled", "user", user.id, {});
    return Response.json({ ok: true, backupCodes: codes });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
