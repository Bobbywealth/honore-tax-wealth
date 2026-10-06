import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_COOKIE,
  bumpSessionWatermark,
  currentUser,
  hashPassword,
  passwordProblem,
  revokeAllSessions,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

const schema = z.object({
  currentPassword: z.string().min(1, "current").max(200, "current"),
  newPassword: z.string().min(1, "new").max(200, "new"),
});

/**
 * Authenticated password change.
 *
 * Requires the current password even for a signed-in user, so a stolen session
 * cookie alone cannot take over the account. On success every other session
 * is revoked and the watermark is bumped.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const problem = passwordProblem(parsed.newPassword);
  if (problem) {
    return Response.json({ ok: false, error: "weak_password", message: problem }, { status: 400 });
  }

  const rows = await getDb()
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const account = rows[0];
  if (!account) {
    return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  if (!(await verifyPassword(parsed.currentPassword, account.passwordHash))) {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), event: "auth.change_password_denied" }),
    );
    return Response.json(
      { ok: false, error: "invalid_credentials", message: "Your current password is incorrect." },
      { status: 401 },
    );
  }

  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.newPassword), updatedAt: new Date() })
    .where(eq(users.id, account.id));

  await revokeAllSessions(account.id);
  await bumpSessionWatermark(account.id);

  // Issue a fresh session so the user is not logged out of the device they
  // are currently using.
  const { token, expires } = await (await import("@/lib/auth")).createSession(account.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));

  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event: "auth.password_changed" }),
  );
  return Response.json({ ok: true });
}