import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { encryptSecret, generateSecret, otpauthUrl } from "@/lib/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begin MFA enrollment: generate a TOTP secret and return the otpauth URL.
 *
 * The secret is stored encrypted but MFA stays disabled until the user
 * confirms with a valid code (POST /api/auth/mfa/confirm). Safe to call
 * repeatedly — each call rotates the pending secret.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    await ensureMigrated();
    const secret = generateSecret();
    await getDb()
      .update(users)
      .set({ totpSecret: encryptSecret(secret), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // The frontend renders the otpauth URL as a QR code (or shows the
    // secret for manual entry). The secret itself is never returned again
    // after this response.
    return Response.json({
      ok: true,
      otpauthUrl: otpauthUrl(secret, user.email),
      secret,
    });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
