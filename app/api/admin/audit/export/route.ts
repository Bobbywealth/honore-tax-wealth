import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, sessions, consultations } from "@/db/schema";
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

/**
 * CSV export of recent admin audit trail: sign-ins (sessions), key
 * intake events (consultations), and any explicit audit_events rows
 * the practice has written.
 */
export async function GET(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return new Response("database unavailable", { status: 503 });

  const lines: string[] = [];
  const header = ["at", "type", "actor", "target", "detail"];
  lines.push(header.map(csvEscape).join(","));

  try {
    await ensureMigrated();
    const sess = await getDb()
      .select({
        createdAt: sessions.createdAt,
        userAgent: sessions.userAgent,
        ipHash: sessions.ipHash,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .orderBy(desc(sessions.createdAt))
      .limit(200);
    for (const s of sess) {
      lines.push([
        s.createdAt.toISOString(),
        "sign-in",
        s.ipHash ?? "",
        s.userAgent ?? "",
        s.revokedAt ? "revoked" : "active",
      ].map(csvEscape).join(","));
    }

    const ints = await getDb()
      .select({
        createdAt: consultations.createdAt,
        name: consultations.name,
        email: consultations.email,
        service: consultations.service,
        status: consultations.status,
      })
      .from(consultations)
      .orderBy(desc(consultations.createdAt))
      .limit(200);
    for (const c of ints) {
      lines.push([
        c.createdAt.toISOString(),
        "consultation",
        "",
        c.email,
        `${c.name} · ${c.service ?? "Consultation"} · ${c.status}`,
      ].map(csvEscape).join(","));
    }

    const audit = await getDb()
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
    for (const a of audit) {
      lines.push([
        a.createdAt.toISOString(),
        a.action,
        a.actorId ?? "",
        a.entityType ?? "",
        a.metadata ? JSON.stringify(a.metadata) : "",
      ].map(csvEscape).join(","));
    }
  } catch {
    return new Response("database error", { status: 500 });
  }

  const body = lines.join("\n") + "\n";
  const filename = `honore-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
