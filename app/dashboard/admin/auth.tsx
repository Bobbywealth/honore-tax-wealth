import { requireRole, type SessionUser } from "@/lib/auth";
import { LockKeyhole } from "lucide-react";

/**
 * Server-side authorization for every /dashboard/admin route.
 *
 * Previously this trusted an `oai-authenticated-user-id` request header against
 * a hardcoded UUID. Any caller could set that header — including anonymous
 * visitors via curl — and read every consultation (name, email, phone, tax
 * message). Access is now derived exclusively from a server-verified session
 * row behind an HttpOnly cookie.
 *
 * The argument is accepted and ignored so the many call sites do not change.
 * Query parameters and request headers never grant access.
 */
export async function checkAdminAccess(_searchParams?: unknown): Promise<
  | { allowed: true; preview: false; user: SessionUser; restricted?: undefined }
  | { allowed: false; preview: false; user: null; restricted: React.ReactElement }
> {
  const user = await requireRole("admin", "staff");
  if (!user) {
    return {
      allowed: false as const,
      preview: false as const,
      user: null,
      restricted: (
        <main className="adm-restricted">
          <LockKeyhole size={32} />
          <h1>Access restricted</h1>
          <p>This dashboard is available to authorized staff only.</p>
          <a href="/login">Sign in</a>
        </main>
      ),
    };
  }
  return { allowed: true as const, preview: false as const, user };
}