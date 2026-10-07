import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary one-off route for launch cleanup. Deletes only the known test lead
 * inserted during QA: apitest@example.com.
 */
export async function POST() {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  await ensureMigrated();
  const rows = await getDb().execute(sql`
    delete from leads
    where lower(email) = lower('apitest@example.com')
    returning id, email, name
  `);
  return Response.json({ ok: true, deleted: rows.rowCount ?? 0 });
}
