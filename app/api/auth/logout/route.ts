import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, destroySession, purgeExpiredSessions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ends the session.
 *
 * Handles both callers: a plain form POST from the portal chrome, which wants a
 * redirect back to sign-in, and a fetch() call, which wants JSON. The session
 * row is deleted server-side, so signing out on one device is a real
 * revocation rather than only clearing the browser cookie.
 */
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

  const accept = (await headers()).get("accept") ?? "";
  if (accept.includes("text/html")) {
    // 303 so the browser follows with GET rather than re-POSTing.
    return new Response(null, { status: 303, headers: { location: "/login" } });
  }

  return Response.json({ ok: true });
}