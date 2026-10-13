import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquareText,
  Receipt,
  ClipboardList,
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import DashboardShell from "../DashboardShell";
import OpenChatButton from "./_components/OpenChatButton";
import QuickMessageForm from "./_components/QuickMessageForm";
import { currentUser } from "@/lib/auth";
import { clientNav } from "./_lib/nav";
import { getDb } from "@/db";
import {
  appointments,
  conversations,
  documentRequests,
  documents,
  engagements,
  invoices,
  messages,
  taxYears,
} from "@/db/schema";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import { authorizedClientIds, primaryClientFor } from "@/lib/access";
import { formatServiceType } from "../_lib/format";

export const dynamic = "force-dynamic";

const ENGAGEMENT_STATUS: Record<string, string> = {
  intake: "Getting started",
  in_preparation: "In preparation",
  client_review: "Ready for your review",
  ready_to_file: "Ready to file",
  filed: "Submitted",
  complete: "Complete",
  on_hold: "On hold",
};

const RETURN_STATUS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  filed: "Filed",
  accepted: "Accepted",
};

function formatDate(value: Date | null, timeZone = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
function dateOnly(value: Date | null, timeZone = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
}
function relative(value: Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateOnly(value);
}

type Counters = {
  activeEngagements: number;
  openRequests: number;
  upcomingAppointments: number;
  unpaidInvoices: number;
};

async function loadCounters(clientId: string): Promise<Counters> {
  try {
    if (!process.env.DATABASE_URL) {
      return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
    }
    await ensureMigrated();
    const db = getDb();
    const [eg, req, appt, inv] = await Promise.all([
      db.select({ c: count() }).from(engagements).where(and(eq(engagements.clientId, clientId), isNull(engagements.archivedAt))),
      db.select({ c: count() }).from(documentRequests).where(and(eq(documentRequests.clientId, clientId), isNull(documentRequests.fulfilledAt))),
      db.select({ c: count() }).from(appointments).where(and(eq(appointments.clientId, clientId), inArray(appointments.status, ["requested", "confirmed"]))),
      db.select({ c: count() }).from(invoices).where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ["sent", "overdue"]))),
    ]);
    return {
      activeEngagements: eg[0]?.c ?? 0,
      openRequests: req[0]?.c ?? 0,
      upcomingAppointments: appt[0]?.c ?? 0,
      unpaidInvoices: inv[0]?.c ?? 0,
    };
  } catch {
    return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
  }
}

export default async function ClientDashboard() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client");

  // Not linked yet: show the "no record" landing, with the sidebar still pointing at sections.
  const clientId = await primaryClientFor(user);

  if (!clientId) {
    return (
      <DashboardShell
        audience="Client"
        title="Your tax home"
        description="Your preparer will connect your account to a client record shortly."
        nav={clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 })}
        userLabel={user.displayName ?? user.email}
        currentHref="/dashboard/client"
      >
        <div className="dashboard-alert">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p>
            <strong>Your account is ready, but it is not linked to a client record yet.</strong> Your
            preparer will connect it. If you have just requested a consultation, no further action is
            needed from you.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const counts = await loadCounters(clientId);
  const nav = clientNav(counts);

  // Pull a rich landing dataset for the work surface.
  let dashboardData:
    | {
        nextAppt: { title: string; startsAt: Date; status: string; timezone: string } | null;
        overdueRequests: Array<{ id: string; title: string; dueAt: Date | null; required: boolean }>;
        recentDocs: Array<{ id: string; originalFilename: string; reviewStatus: string; createdAt: Date; category: string }>;
        recentMessages: Array<{ conversationId: string; subject: string; body: string; senderId: string; createdAt: Date; unread: number }>;
        activeEngagements: Array<{ id: string; name: string; serviceType: string; status: string; progressPercent: number; updatedAt: Date }>;
        taxYears: Array<{ id: string; year: number; filingStatus: string; dueDate: Date | null }>;
        unpaidInvoices: Array<{ id: string; number: string; status: string; total: string; dueAt: Date | null }>;
        timeline: Array<{ at: Date; tone: "neutral" | "good" | "warn" | "info"; label: string; detail?: string }>;
      }
    | null = null;
  let unavailable = false;

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      // Next upcoming appointment.
      const apptRows = await db
        .select({
          title: appointments.title,
          startsAt: appointments.startsAt,
          status: appointments.status,
          timezone: appointments.timezone,
        })
        .from(appointments)
        .where(and(eq(appointments.clientId, clientId), inArray(appointments.status, ["requested", "confirmed"])))
        .orderBy(asc(appointments.startsAt))
        .limit(1);

      // Overdue open document requests.
      const overdueReqs = await db
        .select({ id: documentRequests.id, title: documentRequests.title, dueAt: documentRequests.dueAt, required: documentRequests.required })
        .from(documentRequests)
        .where(and(eq(documentRequests.clientId, clientId), isNull(documentRequests.fulfilledAt), sql`${documentRequests.dueAt} is not null`, sql`${documentRequests.dueAt} < now()`))
        .orderBy(asc(documentRequests.dueAt))
        .limit(5);

      // Last 5 documents uploaded for this client.
      const docsRows = await db
        .select({ id: documents.id, originalFilename: documents.originalFilename, reviewStatus: documents.reviewStatus, createdAt: documents.createdAt, category: documents.category })
        .from(documents)
        .where(and(eq(documents.clientId, clientId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt))
        .limit(5);

      // Last 5 messages across all conversations.
      const convoRows = await db
        .select({ id: conversations.id, subject: conversations.subject, lastMessageAt: conversations.lastMessageAt, unread: conversations.clientUnreadCount })
        .from(conversations)
        .where(eq(conversations.clientId, clientId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(5);
      const convoIds = convoRows.map((c) => c.id);
      const recentMsgs = convoIds.length
        ? await db
            .select({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
            .from(messages)
            .where(inArray(messages.conversationId, convoIds))
            .orderBy(desc(messages.createdAt))
            .limit(8)
        : [];

      const egRows = await db
        .select({ id: engagements.id, name: engagements.name, serviceType: engagements.serviceType, status: engagements.status, progressPercent: engagements.progressPercent, updatedAt: engagements.updatedAt })
        .from(engagements)
        .where(and(eq(engagements.clientId, clientId), isNull(engagements.archivedAt)))
        .orderBy(desc(engagements.updatedAt))
        .limit(5);

      const tyRows = await db
        .select({ id: taxYears.id, year: taxYears.year, filingStatus: taxYears.filingStatus, dueDate: taxYears.dueDate })
        .from(taxYears)
        .where(eq(taxYears.clientId, clientId))
        .orderBy(desc(taxYears.year))
        .limit(5);

      const invRows = await db
        .select({ id: invoices.id, number: invoices.number, status: invoices.status, total: invoices.total, dueAt: invoices.dueAt })
        .from(invoices)
        .where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ["sent", "overdue"])))
        .orderBy(desc(invoices.createdAt))
        .limit(5);

      // Build a chronological "what changed since you last looked" feed.
      const timeline: Array<{ at: Date; tone: "neutral" | "good" | "warn" | "info"; label: string; detail?: string }> = [];
      for (const a of egRows.slice(0, 3)) {
        timeline.push({ at: a.updatedAt, tone: "info", label: `Tax work updated`, detail: a.name });
      }
      for (const d of docsRows.slice(0, 3)) {
        timeline.push({ at: d.createdAt, tone: d.reviewStatus === "approved" ? "good" : d.reviewStatus === "rejected" ? "warn" : "neutral", label: `Document ${d.reviewStatus === "approved" ? "approved" : "received"}`, detail: d.originalFilename });
      }
      for (const m of recentMsgs.slice(0, 3)) {
        timeline.push({ at: m.createdAt, tone: "info", label: "New message", detail: convoRows.find((c) => c.id === m.conversationId)?.subject ?? "" });
      }
      timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

      dashboardData = {
        nextAppt: apptRows[0] ?? null,
        overdueRequests: overdueReqs,
        recentDocs: docsRows,
        recentMessages: recentMsgs.map((m) => ({
          conversationId: m.conversationId,
          subject: convoRows.find((c) => c.id === m.conversationId)?.subject ?? "",
          body: m.body,
          senderId: m.senderId,
          createdAt: m.createdAt,
          unread: convoRows.find((c) => c.id === m.conversationId)?.unread ?? 0,
        })),
        activeEngagements: egRows,
        taxYears: tyRows,
        unpaidInvoices: invRows,
        timeline: timeline.slice(0, 8),
      };
    }
  } catch {
    unavailable = true;
  }

  const totalAttention =
    (dashboardData?.overdueRequests.length ?? 0) +
    (dashboardData?.unpaidInvoices.length ?? 0) +
    (dashboardData?.recentMessages.filter((m) => m.unread > 0).length ?? 0);

  if (!dashboardData) {
    return (
      <DashboardShell
        audience="Client"
        title="Your tax home"
        description="Live view of your account."
        nav={nav}
        userLabel={user.displayName ?? user.email}
        currentHref="/dashboard/client"
      >
        <div className="dashboard-alert">
          <p><strong>We could not load your account just now.</strong> Please refresh, or contact the team if it keeps happening. Nothing has been lost.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      audience="Client"
      title="Your tax home"
      description="Live view of your account. Progress below is set by your preparer and is not a filing confirmation."
      nav={nav}
      userLabel={user.displayName ?? user.email}
      currentHref="/dashboard/client"
    >
      {unavailable || !dashboardData ? (
        <div className="dashboard-alert">
          <p>
            <strong>We could not load your account just now.</strong> Please refresh, or contact the team if it keeps happening. Nothing has been lost.
          </p>
        </div>
      ) : null}

      {/* HERO STRIP — live state of the resource, merged across queues */}
      <section className="client-kpi-strip" aria-label="Account overview">
        <article className="client-kpi">
          <small>Tax work in motion</small>
          <strong>{counts.activeEngagements}</strong>
          <p>{counts.activeEngagements ? "Engagements currently being prepared." : "Nothing in progress."}</p>
        </article>
        <article className={`client-kpi${counts.openRequests ? " is-alert" : ""}`}>
          <small>Documents to send</small>
          <strong>{counts.openRequests}</strong>
          <p>{counts.openRequests ? "Requested by your preparer." : "Nothing outstanding."}</p>
        </article>
        <article className="client-kpi">
          <small>Upcoming appointments</small>
          <strong>{counts.upcomingAppointments}</strong>
          <p>{counts.upcomingAppointments ? "Confirmed or awaiting confirmation." : "None scheduled."}</p>
        </article>
        <article className={`client-kpi${counts.unpaidInvoices ? " is-warn" : ""}`}>
          <small>Outstanding balance</small>
          <strong>${dashboardData.unpaidInvoices.reduce((s, i) => s + Number(i.total || 0), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
          <p>{counts.unpaidInvoices ? `${counts.unpaidInvoices} invoice${counts.unpaidInvoices === 1 ? "" : "s"} unpaid.` : "All caught up."}</p>
        </article>
      </section>

      {/* MERGED TRIAGE — "Needs your attention" */}
      <section className="dashboard-section" aria-labelledby="needs-you">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow"><AlertTriangle size={14} aria-hidden="true" /> ACTION QUEUE</span>
          <h2 id="needs-you">Needs your attention</h2>
          <p className="dashboard-quiet">One merged list of overdue documents, pending replies, and unpaid invoices.</p>
        </div>

        {totalAttention === 0 ? (
          <div className="dashboard-empty">
            <CheckCircle2 size={22} aria-hidden="true" />
            <h3>You are all caught up</h3>
            <p>Nothing is waiting on you. Your preparer will reach out when there is something new.</p>
          </div>
        ) : (
          <ul className="dashboard-triage-list">
            {dashboardData.overdueRequests.map((r) => (
              <li key={`req-${r.id}`} className="dashboard-triage-i is-overdue">
                <span className="dashboard-triage-icon"><FileText size={18} aria-hidden="true" /></span>
                <div className="dashboard-triage-body">
                  <strong>{r.title}</strong>
                  <span>Document overdue · due {dateOnly(r.dueAt)}</span>
                </div>
                <Link className="dashboard-triage-cta" href="/dashboard/client/documents">
                  Open <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
            {dashboardData.unpaidInvoices.map((inv) => (
              <li key={`inv-${inv.id}`} className="dashboard-triage-i is-billing">
                <span className="dashboard-triage-icon"><Receipt size={18} aria-hidden="true" /></span>
                <div className="dashboard-triage-body">
                  <strong>Invoice {inv.number}</strong>
                  <span>${inv.total} {inv.status === "overdue" ? "overdue" : "due"} {dateOnly(inv.dueAt)}</span>
                </div>
                <Link className="dashboard-triage-cta" href="/dashboard/client/invoices">
                  Pay <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
            {dashboardData.recentMessages
              .filter((m) => m.unread > 0)
              .map((m) => (
                <li key={`msg-${m.conversationId}-${m.senderId}-${m.createdAt.getTime()}`} className="dashboard-triage-i is-message">
                  <span className="dashboard-triage-icon"><MessageSquareText size={18} aria-hidden="true" /></span>
                  <div className="dashboard-triage-body">
                    <strong>{m.subject || "New message from your preparer"}</strong>
                    <span>&ldquo;{m.body.slice(0, 140)}{m.body.length > 140 ? "…" : ""}&rdquo; · {relative(m.createdAt)}</span>
                  </div>
                  <OpenChatButton threadId={m.conversationId} className="dashboard-triage-cta" ariaLabel={`Reply to ${m.subject || "message from your preparer"}`}>
                    Reply <ChevronRight size={14} aria-hidden="true" />
                  </OpenChatButton>
                </li>
              ))}
          </ul>
        )}
      </section>

      <div className="dashboard-cols">
        {/* TAX WORK SUMMARY — quick link into the engagements page */}
        <section className="dashboard-section" aria-labelledby="work-summary">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow"><ClipboardList size={14} aria-hidden="true" /> TAX WORK</span>
            <h2 id="work-summary">Engagements</h2>
            <Link href="/dashboard/client/engagements" className="dashboard-eyebrow-link">
              See all <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>

          {dashboardData.activeEngagements.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No engagements yet</h3>
              <p>Your preparer will create an engagement when your scope is confirmed.</p>
            </div>
          ) : (
            <ul className="dashboard-eng-list">
              {dashboardData.activeEngagements.map((e) => {
                const progress = Math.min(100, Math.max(0, Number(e.progressPercent ?? 0)));
                return (
                  <li key={e.id} className="dashboard-eng-i">
                    <div className="dashboard-eng-row1">
                      <strong>{e.name}</strong>
                      <span className="dashboard-eng-tag">{ENGAGEMENT_STATUS[e.status] ?? e.status}</span>
                    </div>
                    <div className="dashboard-eng-progress" role="img" aria-label={`${progress}% complete`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="dashboard-eng-foot">
<span>{formatServiceType(e.serviceType)}</span>
                      <span className="dashboard-muted">Updated {relative(e.updatedAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* TAX YEARS — small detail card */}
        <section className="dashboard-section" aria-labelledby="tax-years">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">YEARS</span>
            <h2 id="tax-years">Tax years on file</h2>
          </div>

          {dashboardData.taxYears.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No tax years yet</h3>
              <p>Once your preparer opens a tax year, it will appear here.</p>
            </div>
          ) : (
            <ul className="dashboard-years-list">
              {dashboardData.taxYears.map((ty) => (
                <li key={ty.id} className="dashboard-years-i">
                  <strong>{ty.year}</strong>
                  <span>{RETURN_STATUS[ty.filingStatus] ?? ty.filingStatus}</span>
                  <span className="dashboard-muted">{ty.dueDate ? `Due ${dateOnly(ty.dueDate)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dashboard-cols">
        {/* NEXT APPOINTMENT — compact card */}
        <section className="dashboard-section" aria-labelledby="next-appt">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow"><CalendarDays size={14} aria-hidden="true" /> NEXT APPOINTMENT</span>
            <h2 id="next-appt">
              {dashboardData.nextAppt ? formatDate(dashboardData.nextAppt.startsAt, dashboardData.nextAppt.timezone) : "No upcoming time"}
            </h2>
          </div>
          {dashboardData.nextAppt ? (
            <div className="dashboard-appt-card">
              <div className="dashboard-appt-title">{dashboardData.nextAppt.title}</div>
              <div className="dashboard-appt-status">
                {dashboardData.nextAppt.status === "requested" ? "Awaiting confirmation" : "Confirmed"}
              </div>
              <Link href="/dashboard/client/appointments" className="dashboard-button dashboard-button-secondary">
                Open calendar <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>Request a consultation and the team will confirm a time with you.</p>
              <button type="button" className="dashboard-button" data-open-consultation>Request a consultation <ArrowUpRight size={16} aria-hidden="true" /></button>
            </div>
          )}
        </section>

        {/* ACTIVITY FEED */}
        <section className="dashboard-section" aria-labelledby="activity">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow"><Sparkles size={14} aria-hidden="true" /> ACTIVITY</span>
            <h2 id="activity">What changed recently</h2>
          </div>
          {dashboardData.timeline.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No recent activity</h3>
              <p>Updates to your tax work and documents will show up here.</p>
            </div>
          ) : (
            <ul className="dashboard-feed">
              {dashboardData.timeline.map((item, idx) => (
                <li key={idx} className={`dashboard-feed-i is-${item.tone}`}>
                  <span className="dashboard-feed-dot" aria-hidden="true" />
                  <div className="dashboard-feed-body">
                    <strong>{item.label}</strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </div>
                  <time className="dashboard-muted">{relative(item.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* RECENT DOCUMENTS — quick table */}
      {dashboardData.recentDocs.length > 0 ? (
        <section className="dashboard-section" aria-labelledby="recent-docs">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow"><FileText size={14} aria-hidden="true" /> RECENT DOCUMENTS</span>
            <h2 id="recent-docs">Files received</h2>
            <Link href="/dashboard/client/documents" className="dashboard-eyebrow-link">
              See all <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className="dashboard-table">
            <table>
              <thead>
                <tr><th>File</th><th>Category</th><th>Status</th><th>Received</th></tr>
              </thead>
              <tbody>
                {dashboardData.recentDocs.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.originalFilename}</b></td>
                    <td className="dashboard-muted">{d.category}</td>
                    <td>
                      <span className={`dashboard-tag ${d.reviewStatus === "approved" ? "is-good" : d.reviewStatus === "rejected" ? "is-bad" : "is-pending"}`}>
                        {d.reviewStatus === "approved" ? "Approved" : d.reviewStatus === "rejected" ? "Needs attention" : "Under review"}
                      </span>
                    </td>
                    <td className="dashboard-muted">{relative(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* SEND MESSAGE — quick composer */}
      <section className="dashboard-section client-checklist" aria-labelledby="send-msg">
        <span className="dashboard-eyebrow"><MessageSquareText size={14} aria-hidden="true" /> SEND A MESSAGE</span>
        <h2 id="send-msg">Ask your preparer anything</h2>
        <p className="dashboard-quiet">Reply in your existing threads from the chat widget, or open a new one here.</p>
        <QuickMessageForm />
      </section>
    </DashboardShell>
  );
}
