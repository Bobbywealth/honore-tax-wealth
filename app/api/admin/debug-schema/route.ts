import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false }, { status: 401 });
  try {
    await ensureMigrated();
    const db = getDb();
    const cols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'consultations'
      ORDER BY ordinal_position
    `);
    return Response.json({ ok: true, columns: cols.rows });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
