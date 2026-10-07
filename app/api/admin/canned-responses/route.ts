import { asc, eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { cannedResponses } from "@/db/schema";
import { ensureMigrated, seedCannedResponsesIfEmpty } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the canned-response list, active first. Seeds on first call. */
export async function GET() {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, canned: [] });

  try {
    await ensureMigrated();
    await seedCannedResponsesIfEmpty();
    const db = getDb();
    const rows = await db
      .select({
        id: cannedResponses.id,
        title: cannedResponses.title,
        body: cannedResponses.body,
        shortcut: cannedResponses.shortcut,
        sortOrder: cannedResponses.sortOrder,
      })
      .from(cannedResponses)
      .where(eq(cannedResponses.active, true))
      .orderBy(asc(cannedResponses.sortOrder), asc(cannedResponses.title));

    return Response.json({ ok: true, canned: rows });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: "500" as never });
  }
}
