import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public list of tax professionals available for selection.
 *
 * Returns only what a prospective client needs: id, display name, and role
 * title. No emails, no phone numbers, no internal data. Deactivated accounts
 * are excluded.
 *
 * Used by the homepage team section ("Work with this professional") and the
 * registration flow (?agent=<id>).
 */
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return Response.json({ ok: true, agents: [] });
    }
    await ensureMigrated();
    const rows = await getDb()
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          or(eq(users.role, "staff"), eq(users.role, "assistant")),
          isNull(users.deactivatedAt),
        ),
      )
      .orderBy(users.displayName);

    // Map internal roles to client-facing titles.
    const agents = rows.map((r) => ({
      id: r.id,
      name: r.displayName ?? "Tax professional",
      title:
        r.role === "assistant"
          ? "Tax Preparer"
          : "Tax Agent",
    }));

    return Response.json(
      { ok: true, agents },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "agents.list.error",
        reason: err instanceof Error ? err.message : "unknown",
      }),
    );
    return Response.json({ ok: true, agents: [] });
  }
}
