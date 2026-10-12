import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, CheckCircle2 } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | null, tz = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(new Date(value));
}
function fmtTime(value: Date | null, tz = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(value));
}

async function loadCounts(clientId: string) {
  if (!process.env.DATABASE_URL) return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 };
  try {
    await ensureMigrated();
    const db = getDb();
    const schema = await import("@/db/schema");
    const [eg, req, appt, inv, msg] = await Promise.all([
      db.select({ c: count() }).from(schema.engagements).where(and(eq(schema.engagements.clientId, clientId), sql`${schema.engagements.archivedAt} IS NULL`)),
      db.select({ c: count() }).from(schema.documentRequests).where(and(eq(schema.documentRequests.clientId, clientId), sql`${schema.documentRequests.fulfilledAt} IS NULL`)),
      db.select({ c: count() }).from(schema.appointments).where(and(eq(schema.appointments.clientId, clientId), sql`${schema.appointments.status} IN ('requested','confirmed')`)),
      db.select({ c: count() }).from(schema.invoices).where(and(eq(schema.invoices.clientId, clientId), sql`${schema.invoices.status} IN ('sent','overdue')`)),
      db.select({ c: sql<number>`coalesce(sum(${schema.conversations.clientUnreadCount}), 0)::int` }).from(schema.conversations).where(eq(schema.conversations.clientId, clientId)),
    ]);
    return {
      activeEngagements: eg[0]?.c ?? 0,
      openRequests: req[0]?.c ?? 0,
      upcomingAppointments: appt[0]?.c ?? 0,
      unpaidInvoices: inv[0]?.c ?? 0,
      unreadMessages: Number(msg[0]?.c ?? 0),
    };
  } catch {
    return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 };
  }
}

export default async function ClientAppointmentsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/appointments");
  const clientId = await primaryClientFor(user);
  const nav = clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 });

  if (!clientId) {
    return (
      <DashboardShell audience="Client" title="Appointments" description="" nav={nav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/appointments">
        <div className="dashboard-alert"><p><strong>No client record linked.</strong></p></div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const nav2 = clientNav(counts);

  let upcoming: Array<{ id: string; title: string; startsAt: Date; endsAt: Date | null; status: string; timezone: string; notes: string | null; location: string | null }> = [];
  let past: Array<{ id: string; title: string; startsAt: Date; endsAt: Date | null; status: string }> = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();
      const now = new Date();

      upcoming = await db
        .select({
          id: appointments.id, title: appointments.title,
          startsAt: appointments.startsAt, endsAt: appointments.endsAt,
          status: appointments.status, timezone: appointments.timezone,
          notes: appointments.notes, location: appointments.location,
        })
        .from(appointments)
        .where(and(eq(appointments.clientId, clientId), gte(appointments.startsAt, now), sql`${appointments.status} NOT IN ('cancelled')`))
        .orderBy(asc(appointments.startsAt));

      past = await db
        .select({
          id: appointments.id, title: appointments.title,
          startsAt: appointments.startsAt, endsAt: appointments.endsAt,
          status: appointments.status,
        })
        .from(appointments)
        .where(and(eq(appointments.clientId, clientId), sql`${appointments.startsAt} < now()`))
        .orderBy(desc(appointments.startsAt))
        .limit(8);
    }
  } catch {
    // best-effort
  }

  const next = upcoming[0];

  return (
    <DashboardShell audience="Client" title="Appointments" description="All scheduled calls and on-site meetings with your preparer." nav={nav2} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/appointments">

      {next ? (
        <section className="client-next-appt" aria-label="Next appointment">
          <div className="client-next-appt-card">
            <div className="client-next-appt-date">
              <span className="month">{fmtDate(next.startsAt, next.timezone).split(",")[0].split(" ")[0]}</span>
              <strong>{new Date(next.startsAt).toLocaleDateString("en-US", { day: "numeric", timeZone: next.timezone })}</strong>
              <span className="year">{new Date(next.startsAt).getFullYear()}</span>
            </div>
            <div className="client-next-appt-body">
              <span className="dashboard-eyebrow"><CalendarDays size={14} aria-hidden="true" /> NEXT APPOINTMENT</span>
              <h2>{next.title}</h2>
              <div className="client-next-appt-meta">
                <span><Clock size={14} aria-hidden="true" /> {fmtTime(next.startsAt, next.timezone)} – {next.endsAt ? fmtTime(next.endsAt, next.timezone) : "TBD"}</span>
                {next.location ? <span>{next.location}</span> : null}
              </div>
              {next.notes ? <p className="dashboard-quiet">{next.notes}</p> : null}
              <div className="client-next-appt-status">
                {next.status === "confirmed" ? (
                  <span className="dashboard-tag is-good"><CheckCircle2 size={12} aria-hidden="true" /> Confirmed</span>
                ) : (
                  <span className="dashboard-tag is-pending">Awaiting confirmation</span>
                )}
                <form action={`/api/client/appointments/${next.id}/cancel`} method="post">
                  <button type="submit" className="dashboard-button dashboard-button-secondary">Reschedule</button>
                </form>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-empty">
          <h2>No upcoming appointments</h2>
          <p>Request a consultation and the team will confirm a time with you.</p>
          <button type="button" className="dashboard-button" data-open-consultation>Request a consultation <ArrowUpRight size={16} aria-hidden="true" /></button>
        </section>
      )}

      {upcoming.length > 1 ? (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">UPCOMING</span>
            <h2>On the schedule next</h2>
          </div>
          <ul className="dashboard-appt-list">
            {upcoming.slice(1).map((a) => (
              <li key={a.id} className="dashboard-appt-i">
                <div className="dashboard-appt-date-mini">
                  <strong>{new Date(a.startsAt).toLocaleDateString("en-US", { day: "numeric", timeZone: a.timezone })}</strong>
                  <span>{new Date(a.startsAt).toLocaleDateString("en-US", { month: "short", timeZone: a.timezone })}</span>
                </div>
                <div className="dashboard-appt-body">
                  <strong>{a.title}</strong>
                  <span className="dashboard-muted">
                    {fmtTime(a.startsAt, a.timezone)} {a.location ? `· ${a.location}` : ""}
                  </span>
                </div>
                <span className={`dashboard-tag ${a.status === "confirmed" ? "is-good" : "is-pending"}`}>
                  {a.status === "confirmed" ? "Confirmed" : "Awaiting"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">PAST</span>
            <h2>Recent history</h2>
          </div>
          <div className="dashboard-table">
            <table>
              <thead>
                <tr><th>Date</th><th>Title</th><th>Status</th></tr>
              </thead>
              <tbody>
                {past.map((a) => (
                  <tr key={a.id}>
                    <td><b>{fmtDate(a.startsAt)}</b></td>
                    <td>{a.title}</td>
                    <td><span className={`dashboard-tag ${a.status === "cancelled" ? "is-bad" : "is-good"}`}>{a.status === "cancelled" ? "Cancelled" : "Completed"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="dashboard-section client-checklist">
        <span className="dashboard-eyebrow">REQUEST</span>
        <h2>Need more time on the calendar?</h2>
        <p className="dashboard-quiet">Honore Tax & Wealth books calls Mon–Thu 9am–5pm ET. Send a few times that work and the team will confirm one.</p>
        <Link href="/dashboard/client/messages" className="dashboard-button">Send a message <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
    </DashboardShell>
  );
}