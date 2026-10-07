import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, MessageSquareText, CheckCircle2, Send } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

function dateOnly(value: Date | null, tz = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: tz }).format(new Date(value));
}
function dateTime(value: Date | null, tz = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(value));
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

export default async function ClientMessagesPage({ searchParams }: { searchParams?: Promise<{ thread?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/messages");
  const clientId = await primaryClientFor(user);
  const nav = clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 });

  if (!clientId) {
    return (
      <DashboardShell audience="Client" title="Messages" description="" nav={nav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/messages">
        <div className="dashboard-alert"><p><strong>No client record linked.</strong></p></div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const nav2 = clientNav(counts);

  let threads: Array<{
    id: string;
    subject: string;
    lastMessageAt: Date | null;
    unread: number;
    lastMessage: { senderId: string; body: string; createdAt: Date; senderName: string } | null;
  }> = [];
  let activeThread:
    | {
        id: string;
        subject: string;
        messages: Array<{ id: string; senderId: string; body: string; createdAt: Date; senderName: string; isMe: boolean }>;
      }
    | null = null;

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      const params = (await searchParams) ?? {};
      const requestedId = params.thread;

      const convoRows = await db
        .select({
          id: conversations.id, subject: conversations.subject,
          lastMessageAt: conversations.lastMessageAt, unread: conversations.clientUnreadCount,
        })
        .from(conversations)
        .where(eq(conversations.clientId, clientId))
        .orderBy(desc(conversations.lastMessageAt));

      const convoIds = convoRows.map((c) => c.id);
      const lastMessages = convoIds.length
        ? await db
            .select({
              id: messages.id, conversationId: messages.conversationId,
              senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt,
              senderName: users.displayName,
            })
            .from(messages)
            .leftJoin(users, eq(users.id, messages.senderId))
            .where(inArray(messages.conversationId, convoIds))
            .orderBy(desc(messages.createdAt))
            .limit(200)
        : [];

      const lastByConvo = new Map<string, typeof lastMessages[number]>();
      for (const m of lastMessages) {
        if (!lastByConvo.has(m.conversationId)) lastByConvo.set(m.conversationId, m);
      }

      threads = convoRows.map((c) => {
        const last = lastByConvo.get(c.id);
        return {
          id: c.id, subject: c.subject,
          lastMessageAt: c.lastMessageAt, unread: c.unread,
          lastMessage: last ? {
            senderId: last.senderId, body: last.body,
            createdAt: last.createdAt, senderName: last.senderName ?? "Honoré Tax & Wealth",
          } : null,
        };
      });

      const activeId = requestedId ?? threads[0]?.id;
      if (activeId && convoIds.includes(activeId)) {
        const threadMsgs = await db
          .select({
            id: messages.id, senderId: messages.senderId,
            body: messages.body, createdAt: messages.createdAt,
            senderName: users.displayName,
          })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderId))
          .where(eq(messages.conversationId, activeId))
          .orderBy(asc(messages.createdAt));
        const subject = convoRows.find((r) => r.id === activeId)?.subject ?? "";
        activeThread = {
          id: activeId, subject,
          messages: threadMsgs.map((m) => ({
            id: m.id, senderId: m.senderId, body: m.body,
            createdAt: m.createdAt, senderName: m.senderName ?? "Honoré Tax & Wealth",
            isMe: m.senderId === user.id,
          })),
        };
      }
    }
  } catch {
    // best-effort
  }

  return (
    <DashboardShell audience="Client" title="Messages" description="All threads with your preparer. Replies are delivered on the next sync." nav={nav2} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/messages">

      <section className="client-kpi-strip" aria-label="Messages summary">
        <article className={`client-kpi${counts.unreadMessages > 0 ? " is-alert" : ""}`}>
          <small>Unread</small>
          <strong>{counts.unreadMessages}</strong>
          <p>{counts.unreadMessages ? "Replies waiting for you." : "All caught up."}</p>
        </article>
        <article className="client-kpi">
          <small>Open threads</small>
          <strong>{threads.length}</strong>
          <p>With Honoré Tax & Wealth.</p>
        </article>
        <article className="client-kpi">
          <small>Average reply time</small>
          <strong>1 business day</strong>
          <p>During tax season, allow up to 48 hours.</p>
        </article>
      </section>

      <section className="dashboard-messages-layout">
        <aside className="dashboard-messages-list-pane">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">THREADS</span>
            <h2>Conversations</h2>
          </div>
          {threads.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No threads yet</h3>
              <p>Start a new conversation below.</p>
            </div>
          ) : (
            <ul className="dashboard-thread-list">
              {threads.map((t) => {
                const active = activeThread?.id === t.id;
                return (
                  <li key={t.id}>
                    <Link href={`/dashboard/client/messages?thread=${t.id}`} className={`dashboard-thread-i${active ? " is-active" : ""}${t.unread > 0 ? " is-unread" : ""}`}>
                      <div className="dashboard-thread-row1">
                        <strong>{t.subject}</strong>
                        {t.unread > 0 ? <span className="dashboard-thread-unread">{t.unread}</span> : null}
                      </div>
                      {t.lastMessage ? (
                        <span className="dashboard-thread-preview">
                          {t.lastMessage.senderName.split(" ").map((p) => p[0]).join("")}: {t.lastMessage.body.slice(0, 80)}{t.lastMessage.body.length > 80 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="dashboard-thread-preview">Awaiting first reply.</span>
                      )}
                      <span className="dashboard-muted">{t.lastMessageAt ? relative(t.lastMessageAt) : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <main className="dashboard-messages-detail-pane">
          {activeThread ? (
            <>
              <div className="dashboard-section-head">
                <span className="dashboard-eyebrow">THREAD</span>
                <h2>{activeThread.subject}</h2>
              </div>
              <ol className="dashboard-bubble-list">
                {activeThread.messages.map((m) => (
                  <li key={m.id} className={`dashboard-bubble${m.isMe ? " is-me" : " is-them"}`}>
                    <div className="dashboard-bubble-meta">
                      <strong>{m.isMe ? "You" : m.senderName}</strong>
                      <span>{dateTime(m.createdAt)}</span>
                    </div>
                    <div className="dashboard-bubble-body">{m.body}</div>
                  </li>
                ))}
              </ol>
              <form action={`/api/client/conversations/${activeThread.id}/reply`} method="post" className="dashboard-quick-form">
                <label className="dashboard-form-notes">
                  Reply
                  <textarea name="body" required maxLength={4000} rows={3} placeholder="Type your reply here…" />
                </label>
                <div className="dashboard-form-actions">
                  <button type="submit" className="dashboard-button">
                    <Send size={14} aria-hidden="true" /> Send reply
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="dashboard-empty">
              <h3>Select a conversation</h3>
              <p>Pick a thread from the left, or start a new one below.</p>
            </div>
          )}

          {/* NEW CONVERSATION */}
          <form action="/api/client/conversations" method="post" className="dashboard-quick-form dashboard-messages-new-form">
            <div className="dashboard-section-head">
              <span className="dashboard-eyebrow"><MessageSquareText size={14} aria-hidden="true" /> NEW THREAD</span>
              <h3>Start a new conversation</h3>
            </div>
            <div className="dashboard-form-row">
              <label>
                Subject
                <input name="subject" required maxLength={200} placeholder="e.g. Question about my 1099" />
              </label>
            </div>
            <label className="dashboard-form-notes">
              Message
              <textarea name="body" required maxLength={4000} rows={3} placeholder="What can we help with?" />
            </label>
            <div className="dashboard-form-actions">
              <button type="submit" className="dashboard-button">
                <Send size={14} aria-hidden="true" /> Send to preparer
              </button>
            </div>
          </form>
        </main>
      </section>
    </DashboardShell>
  );
}