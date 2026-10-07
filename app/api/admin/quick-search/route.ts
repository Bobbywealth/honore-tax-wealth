import { ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, engagements, invoices, leads } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_KIND = 12;

/**
 * Global Cmd-K quick-search endpoint. Searches clients, engagements,
 * invoices, and leads in a single round-trip so the palette can render
 * grouped results without four round-trips.
 */
export async function GET(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, results: [] });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ ok: true, results: [] });

  try {
    await ensureMigrated();
    const db = getDb();
    const like = `%${q.toLowerCase()}%`;

    const [cli, eng, inv, ld] = await Promise.all([
      db
        .select({
          id: clients.id,
          displayName: clients.displayName,
          email: clients.email,
        })
        .from(clients)
        .where(or(ilike(clients.displayName, like), ilike(clients.email, like), ilike(clients.legalName, like)))
        .limit(MAX_PER_KIND),
      db
        .select({
          id: engagements.id,
          name: engagements.name,
          serviceType: engagements.serviceType,
        })
        .from(engagements)
        .where(ilike(engagements.name, like))
        .limit(MAX_PER_KIND),
      db
        .select({
          id: invoices.id,
          number: invoices.number,
          total: invoices.total,
          status: invoices.status,
        })
        .from(invoices)
        .where(or(ilike(invoices.number, like), sql`${invoices.total}::text ILIKE ${like}`))
        .limit(MAX_PER_KIND),
      db
        .select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          stage: leads.stage,
        })
        .from(leads)
        .where(or(ilike(leads.name, like), ilike(leads.email, like)))
        .limit(MAX_PER_KIND),
    ]);

    return Response.json({
      ok: true,
      results: {
        clients: cli.map((c) => ({ id: c.id, label: c.displayName, sub: c.email, href: `/dashboard/admin/clients?focus=${c.id}` })),
        engagements: eng.map((e) => ({ id: e.id, label: e.name, sub: e.serviceType, href: `/dashboard/admin/returns?focus=${e.id}` })),
        invoices: inv.map((i) => ({ id: i.id, label: i.number, sub: `$${i.total} · ${i.status}`, href: `/dashboard/admin/invoices?focus=${i.id}` })),
        leads: ld.map((l) => ({ id: l.id, label: l.name, sub: `${l.email} · ${l.stage}`, href: `/dashboard/admin/leads?focus=${l.id}` })),
      },
    });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}