import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession, purgeExpiredSessions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySession(token);
    } catch {
      // A failed delete must still clear the browser cookie.
    }
  }
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  try {
    await purgeExpiredSessions();
  } catch {
    // Housekeeping only; never block logout on it.
  }
  return Response.json({ ok: true });
}