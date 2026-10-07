import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { SESSION_COOKIE } from "@/lib/auth";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signs out every active session for the current staff user. Used from the
 * Settings -> Security & audit panel.
 */
export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token && process.env.DATABASE_URL) {
    try {
      await ensureMigrated();
      await getDb()
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(sql`${sessions.tokenHash} = encode(digest(${token}, 'sha256'), 'hex')`);
    } catch {
      // best-effort
    }
  }
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  revalidatePath("/", "layout");
  return Response.redirect(new URL("/login", request.url), 303);
}
