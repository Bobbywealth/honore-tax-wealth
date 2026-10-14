import { CalendarDays, AlertCircle } from "lucide-react";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { navForRole } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, taxYears } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { scopedClientIdsFor } from "../_lib/scoping";

export const dynamic = "force-dynamic";

/* Static federal + NJ deadlines for the 2026 tax year. */
const STATIC_DEADLINES: Array<{ date: string; title: string; description: string }> = [
  { date: "2026-01-15", title: "Q4 2025 estimated tax payment", description: "Federal + NJ estimated tax, 4th quarter 2025." },
  { date: "2026-03-15", title: "S-corp & partnership filing deadline", description: "Forms 1120-S and 1065 for calendar-year entities." },
  { date: "2026-04-15", title: "Individual filing deadline", description: "Form 1040 for 2025. Q1 2026 estimated payment also due." },
  { date: "2026-04-15", title: "C-corp filing deadline", description: "Form 1120 for calendar-year C corporations." },
  { date: "2026-06-15", title: "Q2 estimated tax payment", description: "Federal + NJ estimated tax, 2nd quarter 2026." },
  { date: "2026-09-15", title: "Q3 estimated tax payment", description: "Federal + NJ estimated tax, 3rd quarter 2026." },
  { date: "2026-09-15", title: "Extended S-corp & partnership deadline", description: "Extended Forms 1120-S and 1065." },
  { date: "2026-10-15", title: "Extended individual & C-corp deadline", description: "Extended Forms 1040 and 1120." },
  { date: "2027-01-15", title: "Q4 2026 estimated tax payment", description: "Federal + NJ estimated tax, 4th quarter 2026." },
];

type DeadlineItem = {
  date: Date;
  title: string;
  description: string;
  clientName: string | null;
  kind: "statutory" | "client";
};

function daysUntil(d: Date): number {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(d);
}

export default async function DeadlinesPage({ searchParams }: { searchParams?: Promise<unknown> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;

  const me = await currentUser();
  const nav = navForRole(me?.role, await loadAdminNavCounts());

  const items: DeadlineItem[] = STATIC_DEADLINES.map((s) => ({
    date: new Date(s.date + "T12:00:00"),
    title: s.title,
    description: s.description,
    clientName: null,
    kind: "statutory",
  }));

  let unavailable = false;
  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();
      const scoped = me?.id ? await scopedClientIdsFor({ id: me.id, role: me.role }) : null;
      const now = new Date();

      // Client-specific deadlines from tax years with due dates.
      const yearRows = await db
        .select({
          dueDate: taxYears.dueDate,
          year: taxYears.year,
          clientName: clients.displayName,
          clientId: taxYears.clientId,
        })
        .from(taxYears)
        .leftJoin(clients, eq(clients.id, taxYears.clientId))
        .where(gte(taxYears.dueDate, now));
      for (const y of yearRows) {
        if (scoped !== null && y.clientId && !scoped.includes(y.clientId)) continue;
        if (!y.dueDate) continue;
        items.push({
          date: new Date(y.dueDate),
          title: `Tax year ${y.year} — ${y.clientName ?? "client"}`,
          description: "Tax year with a due date on file.",
          clientName: y.clientName,
          kind: "client",
        });
      }
    }
  } catch {
    unavailable = true;
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = items.filter((i) => daysUntil(i.date) >= 0);
  const past = items.filter((i) => daysUntil(i.date) < 0).slice(-5).reverse();

  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/deadlines" audience="Admin" title="Deadlines" description="Statutory filing dates plus client-specific due dates.">
      <div className="adm-page-h">
        <div>
          <h1>Deadlines</h1>
          <div className="sub">
            {unavailable ? "Unavailable" : `${upcoming.length} upcoming · statutory + client-specific`}
          </div>
        </div>
      </div>

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load deadlines. Nothing has been lost — try again shortly.</p>
        </div>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <div className="adm-empty">
              <CalendarDays size={22} aria-hidden="true" />
              <h2>No upcoming deadlines</h2>
              <p>Statutory dates for next year will appear here.</p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="sr-only">Upcoming tax deadlines</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Deadline</th>
                    <th scope="col">Details</th>
                    <th scope="col">In</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((d, i) => {
                    const days = daysUntil(d.date);
                    const urgent = days <= 14;
                    return (
                      <tr key={`${d.kind}-${i}`}>
                        <td>
                          <b>{fmtDate(d.date)}</b>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {urgent ? <AlertCircle size={14} aria-hidden="true" color="#a63b37" /> : null}
                            <strong>{d.title}</strong>
                          </div>
                          {d.clientName ? <div className="adm-card-meta">{d.clientName}</div> : null}
                        </td>
                        <td className="adm-card-meta">{d.description}</td>
                        <td>
                          <span className="adm-badge" style={urgent ? { background: "#f6d8d6", color: "#7a2a25" } : undefined}>
                            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {past.length > 0 ? (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>Recently passed</h2>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <tbody>
                    {past.map((d, i) => (
                      <tr key={`past-${i}`}>
                        <td><b>{fmtDate(d.date)}</b></td>
                        <td><strong>{d.title}</strong></td>
                        <td className="adm-card-meta">{Math.abs(daysUntil(d.date))} days ago</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}
