import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function startOf(period: string, ref = new Date()): Date {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (period === "quarter") return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
  if (period === "ytd") return new Date(Date.UTC(y, 0, 1));
  return new Date(Date.UTC(y, m, 1));
}

/**
 * CSV export of paid invoices for the requested period. Used by the
 * Reports page's 'Export CSV' button.
 */
export async function GET(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return new Response("database unavailable", { status: 503 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "quarter" || url.searchParams.get("period") === "ytd" ? url.searchParams.get("period")! : "month";
  const since = startOf(period);

  let rows: Array<{
    number: string;
    client: string | null;
    status: string;
    total: string;
    paidAt: Date | null;
    paymentProvider: string | null;
    paymentReference: string | null;
  }> = [];

  try {
    await ensureMigrated();
    const result = await getDb()
      .select({
        number: invoices.number,
        status: invoices.status,
        total: invoices.total,
        paidAt: invoices.paidAt,
        paymentProvider: invoices.paymentProvider,
        paymentReference: invoices.paymentReference,
        client: clients.displayName,
      })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(eq(invoices.status, "paid"), gte(invoices.paidAt, since)))
      .orderBy(invoices.paidAt);
    rows = result.map((r) => ({ ...r }));
  } catch {
    return new Response("database error", { status: 500 });
  }

  const header = ["Invoice #", "Client", "Status", "Total", "Paid at", "Payment provider", "Payment reference"];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.number),
      csvEscape(r.client),
      csvEscape(r.status),
      csvEscape(r.total),
      csvEscape(r.paidAt ? r.paidAt.toISOString() : ""),
      csvEscape(r.paymentProvider),
      csvEscape(r.paymentReference),
    ].join(","));
  }
  const body = lines.join("\n") + "\n";
  const filename = `honore-invoices-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
