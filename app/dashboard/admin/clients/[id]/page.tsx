import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import DashboardShell from "../../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { adminNav } from "../../../admin/_lib/nav";
import { loadAdminNavCounts } from "../../../admin/lib/nav-counts";
import { getDb } from "@/db";
import {
  appointments,
  clients,
  consultations,
  conversations,
  documentRequests,
  engagements,
  invoices,
  messages,
  returns,
  taxYears,
  users,
} from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { CalendarDays, ClipboardList, FileText, MessageSquareText, Receipt, UserRoundCheck } from "lucide-react";
import { formatServiceType } from "../../../_lib/format";

export const dynamic = "force-dynamic";

function relative(value: Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(value));
}
function dateOnly(value: Date | null, tz = "America/New_York"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: tz }).format(new Date(value));
}

type TimelineEvent = {
  id: string;
  at: Date;
  kind: "consultation" | "message" | "appointment" | "invoice" | "return" | "document_request" | "engagement";
  tone: "neutral" | "good" | "warn" | "info";
  label: string;
  detail?: string;
  href?: string;
};

export default async function AdminClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ focus?: string; assigned?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/admin/clients");
  if (user.role === "client") redirect("/dashboard/client");

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = (await searchParams) ?? {};

  const counts = await loadAdminNavCounts();
  const nav = adminNav(counts);

  let client: {
    id: string;
    displayName: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    entityType: string;
    status: string;
    createdAt: Date;
    ownerId: string | null;
  } | null = null;
  let engagementsRows: Array<{ id: string; name: string; serviceType: string; status: string; progressPercent: number; updatedAt: Date }> = [];
  let taxYearsRows: Array<{ id: string; year: number; filingStatus: string; dueDate: Date | null }> = [];
  let returnsRows: Array<{ id: string; engagementId: string; formType: string; stage: string; preparedAt: Date | null; filedAt: Date | null }> = [];
  let invoicesRows: Array<{ id: string; number: string; total: string; status: string; dueAt: Date | null; paidAt: Date | null; createdAt: Date }> = [];
  let appointmentsRows: Array<{ id: string; title: string; startsAt: Date; status: string; timezone: string }> = [];
  let requestsRows: Array<{ id: string; title: string; required: boolean; dueAt: Date | null; fulfilledAt: Date | null; createdAt: Date }> = [];
  let timeline: TimelineEvent[] = [];
  let conversationCount = 0;
  let messageCount = 0;
  let lifetimeSpent = 0;
  // Assignment UI. The list of assignable agents is admin-only — staff/assistant
  // never see this control, so the dropdown is empty for them and the form is
  // suppressed in the render below via `isAdmin`.
  let agentOptions: Array<{ id: string; displayName: string | null; email: string; role: string }> = [];
  let currentOwner: { id: string; displayName: string | null; email: string; role: string } | null = null;
  let unavailable = false;

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      const clientRows = await db
        .select({
          id: clients.id,
          displayName: clients.displayName,
          legalName: clients.legalName,
          email: clients.email,
          phone: clients.phone,
          entityType: clients.entityType,
          status: clients.status,
          createdAt: clients.createdAt,
          ownerId: clients.ownerId,
        })
        .from(clients)
        .where(eq(clients.id, id))
        .limit(1);
      if (clientRows.length === 0) notFound();
      client = clientRows[0];

      // Assignable agents: every non-client, non-deactivated user. Admins
      // pick from the full staff pool; "Unassigned" is the empty value
      // for temporarily or permanently de-assigning the client.
      agentOptions = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(sql`${users.deactivatedAt} IS NULL`, sql`${users.role} <> 'client'`))
        .orderBy(users.displayName, users.email)
        .limit(200);

      if (client.ownerId) {
        const ownerRows = await db
          .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, client.ownerId))
          .limit(1);
        currentOwner = ownerRows[0] ?? null;
      }

      const egIdsRows = await db
        .select({ id: engagements.id })
        .from(engagements)
        .where(and(eq(engagements.clientId, id), sql`${engagements.archivedAt} IS NULL`));
      const egIds = egIdsRows.map((r) => r.id);

      engagementsRows = await db
        .select({
          id: engagements.id, name: engagements.name, serviceType: engagements.serviceType,
          status: engagements.status, progressPercent: engagements.progressPercent, updatedAt: engagements.updatedAt,
        })
        .from(engagements)
        .where(and(eq(engagements.clientId, id), sql`${engagements.archivedAt} IS NULL`))
        .orderBy(desc(engagements.updatedAt));

      taxYearsRows = await db
        .select({ id: taxYears.id, year: taxYears.year, filingStatus: taxYears.filingStatus, dueDate: taxYears.dueDate })
        .from(taxYears)
        .where(eq(taxYears.clientId, id))
        .orderBy(desc(taxYears.year));

      returnsRows = egIds.length
        ? await db
            .select({
              id: returns.id, engagementId: returns.engagementId, formType: returns.formType,
              stage: returns.stage, preparedAt: returns.preparedAt, filedAt: returns.filedAt,
            })
            .from(returns)
            .where(inArray(returns.engagementId, egIds))
            .orderBy(desc(returns.updatedAt))
        : [];

      invoicesRows = await db
        .select({
          id: invoices.id, number: invoices.number, total: invoices.total, status: invoices.status,
          dueAt: invoices.dueAt, paidAt: invoices.paidAt, createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(eq(invoices.clientId, id))
        .orderBy(desc(invoices.createdAt))
        .limit(50);

      appointmentsRows = await db
        .select({
          id: appointments.id, title: appointments.title, startsAt: appointments.startsAt,
          status: appointments.status, timezone: appointments.timezone,
        })
        .from(appointments)
        .where(eq(appointments.clientId, id))
        .orderBy(desc(appointments.startsAt))
        .limit(20);

      requestsRows = await db
        .select({
          id: documentRequests.id, title: documentRequests.title, required: documentRequests.required,
          dueAt: documentRequests.dueAt, fulfilledAt: documentRequests.fulfilledAt, createdAt: documentRequests.createdAt,
        })
        .from(documentRequests)
        .where(eq(documentRequests.clientId, id))
        .orderBy(desc(documentRequests.createdAt))
        .limit(50);

      // Build the consolidated timeline.
      const events: TimelineEvent[] = [];
      const consultationsRows = await db
        .select({ id: consultations.id, name: consultations.name, service: consultations.service, createdAt: consultations.createdAt, status: consultations.status })
        .from(consultations)
        .where(eq(consultations.email, client.email ?? ""))
        .orderBy(desc(consultations.createdAt))
        .limit(50);
      for (const c of consultationsRows) {
        events.push({
          id: `c-${c.id}`, at: c.createdAt, kind: "consultation",
          tone: c.status === "new" ? "warn" : "neutral",
          label: `Consultation: ${c.service}`,
          detail: `${c.name} · status ${c.status}`,
          href: `/dashboard/admin/inbox?q=${encodeURIComponent(c.name)}`,
        });
      }
      const convoRows = await db
        .select({ id: conversations.id, lastMessageAt: conversations.lastMessageAt, subject: conversations.subject, unread: conversations.staffUnreadCount })
        .from(conversations)
        .where(eq(conversations.clientId, id));
      conversationCount = convoRows.length;
      for (const c of convoRows) {
        if (!c.lastMessageAt) continue;
        events.push({
          id: `conv-${c.id}`, at: c.lastMessageAt, kind: "message",
          tone: c.unread > 0 ? "warn" : "info",
          label: `Message thread: ${c.subject}`,
          detail: c.unread > 0 ? `${c.unread} unread` : "Recently active",
          href: `/dashboard/admin/messages?thread=${c.id}`,
        });
      }
      const messageRows = convoRows.length
        ? await db
            .select({
              id: messages.id, conversationId: messages.conversationId,
              senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt,
            })
            .from(messages)
            .where(inArray(messages.conversationId, convoRows.map((c) => c.id)))
            .orderBy(desc(messages.createdAt))
            .limit(60)
        : [];
      messageCount = messageRows.length;
      for (const m of messageRows) {
        events.push({
          id: `m-${m.id}`, at: m.createdAt, kind: "message",
          tone: "info",
          label: `Message: ${m.body.slice(0, 80)}${m.body.length > 80 ? "…" : ""}`,
          detail: relative(m.createdAt),
          href: `/dashboard/admin/messages?thread=${m.conversationId}`,
        });
      }
      for (const a of appointmentsRows.slice(0, 12)) {
        const isUpcoming = new Date(a.startsAt).getTime() >= Date.now();
        events.push({
          id: `a-${a.id}`, at: a.startsAt, kind: "appointment",
          tone: isUpcoming ? "good" : "neutral",
          label: `Appointment: ${a.title}`,
          detail: `${dateOnly(a.startsAt, a.timezone)} · ${a.status}`,
          href: `/dashboard/admin/calendar`,
        });
      }
      for (const inv of invoicesRows.slice(0, 12)) {
        const overdue = inv.status === "overdue" || (inv.dueAt && new Date(inv.dueAt).getTime() < Date.now() && inv.status !== "paid");
        events.push({
          id: `inv-${inv.id}`, at: inv.createdAt, kind: "invoice",
          tone: overdue ? "warn" : inv.status === "paid" ? "good" : "info",
          label: `Invoice ${inv.number}`,
          detail: `$${inv.total} · ${inv.status}${inv.dueAt ? ` · due ${dateOnly(inv.dueAt)}` : ""}`,
          href: `/dashboard/admin/invoices?focus=${inv.id}`,
        });
        if (inv.status === "paid") lifetimeSpent += Number(inv.total);
      }
      for (const r of returnsRows.slice(0, 12)) {
        events.push({
          id: `ret-${r.id}`, at: r.preparedAt ?? r.filedAt ?? new Date(0), kind: "return",
          tone: r.filedAt ? "good" : r.stage === "ready_to_file" ? "info" : "neutral",
          label: `Return ${r.formType}`,
          detail: r.filedAt ? `Filed ${dateOnly(r.filedAt)}` : `Stage: ${r.stage}`,
          href: `/dashboard/admin/returns?focus=${r.id}`,
        });
      }
      for (const r of requestsRows.slice(0, 12)) {
        events.push({
          id: `req-${r.id}`, at: r.createdAt, kind: "document_request",
          tone: r.fulfilledAt ? "good" : "warn",
          label: `Doc request: ${r.title}`,
          detail: r.fulfilledAt ? `Fulfilled ${dateOnly(r.fulfilledAt)}` : (r.dueAt ? `Due ${dateOnly(r.dueAt)}` : "Awaiting upload"),
          href: `/dashboard/admin/documents`,
        });
      }
      for (const e of engagementsRows.slice(0, 8)) {
        events.push({
          id: `eng-${e.id}`, at: e.updatedAt, kind: "engagement",
          tone: e.status === "on_hold" ? "warn" : "info",
          label: `Engagement: ${e.name}`,
          detail: `${formatServiceType(e.serviceType)} · ${e.progressPercent}% complete`,
          href: `/dashboard/admin/returns?focus=${e.id}`,
        });
      }
      timeline = events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 80);
    }
  } catch {
    unavailable = true;
  }

  if (!client) notFound();

  // Group the timeline by day for a cleaner visual.
  const dayGroups = new Map<string, TimelineEvent[]>();
  for (const ev of timeline) {
    const d = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date(ev.at));
    if (!dayGroups.has(d)) dayGroups.set(d, []);
    dayGroups.get(d)!.push(ev);
  }

  const outstandingRequests = requestsRows.filter((r) => !r.fulfilledAt).length;
  const upcomingAppointments = appointmentsRows.filter((a) => new Date(a.startsAt).getTime() >= Date.now()).length;
  const unpaidInvoices = invoicesRows.filter((i) => i.status === "sent" || i.status === "overdue").length;
  const openReturns = returnsRows.filter((r) => !r.filedAt).length;

  return (
    <DashboardShell
      nav={nav}
      audience="Admin"
      title={client.displayName}
      description={`Every action for ${client.displayName} in one chronological stream.`}
      currentHref="/dashboard/admin/clients"
    >
      {unavailable || !client ? (
        <div className="dashboard-alert">
          <p><strong>We could not load this client.</strong> Try refreshing.</p>
        </div>
      ) : null}

      {/* KPI strip */}
      <section className="client-kpi-strip" aria-label="Client summary">
        <article className="client-kpi">
          <small>Tax work</small>
          <strong>{engagementsRows.length}</strong>
          <p>Active matters, including the ones in preparation.</p>
        </article>
        <article className={`client-kpi${unpaidInvoices ? " is-warn" : ""}`}>
          <small>Open balance</small>
          <strong>${invoicesRows.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + Number(i.total), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
          <p>{unpaidInvoices} invoice{unpaidInvoices === 1 ? "" : "s"} outstanding.</p>
        </article>
        <article className={`client-kpi${outstandingRequests ? " is-alert" : ""}`}>
          <small>Open requests</small>
          <strong>{outstandingRequests}</strong>
          <p>Your preparer is waiting on these.</p>
        </article>
        <article className="client-kpi">
          <small>Lifetime billed</small>
          <strong>${lifetimeSpent.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
          <p>Across {invoicesRows.length} invoice{invoicesRows.length === 1 ? "" : "s"}.</p>
        </article>
      </section>

      <div className="dashboard-cols">
        {/* ACTIVITY TIMELINE */}
        <section className="dashboard-section" aria-labelledby="timeline">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow"><MessageSquareText size={14} aria-hidden="true" /> ACTIVITY</span>
            <h2 id="timeline">Activity timeline</h2>
            <p className="dashboard-quiet">Every consultation, message, appointment, return, invoice, and document request for this client — most recent first.</p>
          </div>

          {timeline.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No activity yet</h3>
              <p>Once this client sends a message, books an appointment, or you issue an invoice, it will appear here.</p>
            </div>
          ) : (
            <div className="timeline-root">
              {Array.from(dayGroups.entries()).map(([day, events]) => (
                <div className="timeline-day" key={day}>
                  <div className="timeline-day-sep">
                    <span>{day}</span>
                  </div>
                  <ol className="timeline-list">
                    {events.map((ev) => (
                      <li key={ev.id} className={`timeline-i is-${ev.tone}`}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <div className="timeline-body">
                          {ev.href ? (
                            <Link href={ev.href} className="timeline-label">{ev.label}</Link>
                          ) : (
                            <span className="timeline-label">{ev.label}</span>
                          )}
                          {ev.detail ? <span className="timeline-detail">{ev.detail}</span> : null}
                        </div>
                        <time className="timeline-time">{relative(ev.at)}</time>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CLIENT SUMMARY SIDEBAR */}
        <section className="dashboard-section client-summary-side" aria-labelledby="client-summary">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">CLIENT</span>
            <h2 id="client-summary">{client.displayName}</h2>
          </div>

          <dl className="client-summary-dl">
            <div><dt>Status</dt><dd><span className={`dashboard-tag ${client.status === "active" ? "is-good" : "is-pending"}`}>{client.status}</span></dd></div>
            <div><dt>Entity type</dt><dd>{client.entityType}</dd></div>
            {client.legalName && client.legalName !== client.displayName ? (
              <div><dt>Legal name</dt><dd>{client.legalName}</dd></div>
            ) : null}
            {client.email ? <div><dt>Email</dt><dd><a href={`mailto:${client.email}`}>{client.email}</a></dd></div> : null}
            {client.phone ? <div><dt>Phone</dt><dd><a href={`tel:${client.phone}`}>{client.phone}</a></dd></div> : null}
            <div><dt>Client since</dt><dd>{dateOnly(client.createdAt)}</dd></div>
          </dl>

          {/* ASSIGNMENT: admin-only. Bobby asked for the ability to pin a
            client to a specific agent; the assignment cascades onto every
            non-archived engagement for the client so the row-level scoping
            helper (engagements.owner_id) stays in sync. The form is hidden
            for any non-admin viewer — they can see WHO handles this client
            (the read-only assignment row below) but cannot change it. */}
          {user.role === "admin" ? (
            <section style={{ marginTop: 18, padding: "14px 16px", border: "1px solid rgba(184,138,60,.35)", borderRadius: 10, background: "rgba(184,138,60,.06)" }} aria-label="Assign to agent">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, font: "800 12px Manrope", letterSpacing: ".06em", textTransform: "uppercase", color: "#5b6c78" }}>
                <UserRoundCheck size={14} aria-hidden="true" /> Primary agent
              </h3>
              {sp.assigned !== undefined ? (
                <p className="dashboard-quiet" style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: "#2f8a5b" }}>
                  {sp.assigned === ""
                    ? "Unassigned. This client is currently without a primary agent."
                    : `Saved. ${currentOwner?.displayName || currentOwner?.email || "Agent"} is now the primary agent.`}
                </p>
              ) : null}
              <form action={`/api/admin/clients/${client.id}/assign`} method="post" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <select name="ownerId" defaultValue={client.ownerId ?? ""} aria-label="Primary agent" style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(184,138,60,.55)", background: "#fff", color: "#0e1a26", font: "600 13px Manrope" }}>
                  <option value="">— Unassigned —</option>
                  {agentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || a.email} · {a.role}
                    </option>
                  ))}
                </select>
                <button type="submit" className="dashboard-button" style={{ background: "#0e1a26", color: "#fff" }}>
                  Save assignment
                </button>
                <p className="dashboard-quiet" style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "#5b6c78" }}>
                  Saves the primary agent and cascades the owner onto every active engagement so the agent's Clients, Returns, Documents, Tasks, and Calendar only show this client's records.
                </p>
              </form>
            </section>
          ) : currentOwner ? (
            <section style={{ marginTop: 18, padding: "10px 14px", border: "1px solid rgba(11,26,42,.12)", borderRadius: 10, background: "rgba(11,26,42,.03)" }} aria-label="Assigned agent">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, font: "800 11px Manrope", letterSpacing: ".06em", textTransform: "uppercase", color: "#5b6c78" }}>
                <UserRoundCheck size={13} aria-hidden="true" /> Your assignment
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#0e1a26" }}>
                {currentOwner.displayName || currentOwner.email}{" "}
                <span style={{ color: "#5b6c78", fontWeight: 600 }}>· {currentOwner.role}</span>
              </p>
            </section>
          ) : null}

          <h3 style={{ marginTop: 22, font: "700 12px Manrope", letterSpacing: ".06em", textTransform: "uppercase", color: "#5b6c78" }}>Quick links</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <Link href="/dashboard/admin/messages" className="dashboard-button dashboard-button-secondary"><MessageSquareText size={14} aria-hidden="true" /> Open messages ({conversationCount})</Link>
            <Link href="/dashboard/admin/calendar" className="dashboard-button dashboard-button-secondary"><CalendarDays size={14} aria-hidden="true" /> Calendar ({upcomingAppointments})</Link>
            <Link href="/dashboard/admin/returns" className="dashboard-button dashboard-button-secondary"><ClipboardList size={14} aria-hidden="true" /> Returns ({engagementsRows.length})</Link>
            <Link href="/dashboard/admin/invoices" className="dashboard-button dashboard-button-secondary"><Receipt size={14} aria-hidden="true" /> Invoices ({invoicesRows.length})</Link>
            <Link href="/dashboard/admin/documents" className="dashboard-button dashboard-button-secondary"><FileText size={14} aria-hidden="true" /> Documents ({requestsRows.length})</Link>
          </div>

          <h3 style={{ marginTop: 22, font: "700 12px Manrope", letterSpacing: ".06em", textTransform: "uppercase", color: "#5b6c78" }}>Tax years</h3>
          {taxYearsRows.length === 0 ? (
            <p className="dashboard-quiet" style={{ marginTop: 8 }}>No tax years linked yet.</p>
          ) : (
            <ul className="dashboard-years-list" style={{ marginTop: 8 }}>
              {taxYearsRows.map((ty) => (
                <li key={ty.id}>
                  <strong>{ty.year}</strong>
                  <span>{ty.filingStatus}</span>
                  <span className="dashboard-muted">{ty.dueDate ? `Due ${dateOnly(ty.dueDate)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}

          {messageCount > 0 ? (
            <p className="dashboard-quiet" style={{ marginTop: 18 }}>
              {messageCount} messages across {conversationCount} thread{conversationCount === 1 ? "" : "s"}.
            </p>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}