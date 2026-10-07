import { redirect } from "next/navigation";
import DashboardShell from "../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

async function loadCounts(clientId: string) {
  if (!process.env.DATABASE_URL) return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 };
  try {
    await ensureMigrated();
    const db = getDb();
    const schema = await import("@/db/schema");
    const [eg, req, appt, inv, msg] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(schema.engagements).where(and(eq(schema.engagements.clientId, clientId), isNull(schema.engagements.archivedAt))),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.documentRequests).where(and(eq(schema.documentRequests.clientId, clientId), isNull(schema.documentRequests.fulfilledAt))),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.appointments).where(and(eq(schema.appointments.clientId, clientId), sql`${schema.appointments.status} IN ('requested','confirmed')`)),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.invoices).where(and(eq(schema.invoices.clientId, clientId), sql`${schema.invoices.status} IN ('sent','overdue')`)),
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

type Sender = { id: string; name: string };
type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
type Thread = {
  id: string;
  subject: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { senderName: string; body: string; createdAt: string } | null;
};

export default async function ClientMessagesPage({ searchParams }: { searchParams?: Promise<{ thread?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/messages");
  const clientId = await primaryClientFor(user);

  if (!clientId) {
    return (
      <DashboardShell
        audience="Client" title="Messages" description=""
        nav={clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 })}
        userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/messages"
      >
        <div className="dashboard-alert"><p><strong>No client record linked.</strong> Ask your preparer to connect your account.</p></div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const nav = clientNav(counts);

  let threads: Thread[] = [];
  let activeThread: { id: string; subject: string; messages: ChatMessage[]; participants: Sender[] } | null = null;
  let initialMessages: ChatMessage[] = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      const params = (await searchParams) ?? {};
      const requestedId = params.thread;

      const convoRows = await db
        .select({ id: conversations.id, subject: conversations.subject, lastMessageAt: conversations.lastMessageAt, unread: conversations.clientUnreadCount })
        .from(conversations)
        .where(eq(conversations.clientId, clientId))
        .orderBy(desc(conversations.lastMessageAt));

      const convoIds = convoRows.map((c) => c.id);

      const lastMsgs = convoIds.length
        ? await db
            .select({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt, senderName: users.displayName })
            .from(messages)
            .leftJoin(users, eq(users.id, messages.senderId))
            .where(inArray(messages.conversationId, convoIds))
            .orderBy(desc(messages.createdAt))
            .limit(400)
        : [];
      const lastByConvo = new Map<string, typeof lastMsgs[number]>();
      for (const m of lastMsgs) if (!lastByConvo.has(m.conversationId)) lastByConvo.set(m.conversationId, m);

      threads = convoRows.map((c) => {
        const last = lastByConvo.get(c.id);
        return {
          id: c.id, subject: c.subject,
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
          unread: c.unread,
          lastMessage: last ? {
            senderName: last.senderName ?? "Honoré Tax & Wealth",
              body: last.body,
              createdAt: last.createdAt.toISOString(),
            } : null,
        };
      });

      const activeId = requestedId ?? threads[0]?.id;
      if (activeId && convoIds.includes(activeId)) {
        const threadMsgs = await db
          .select({
            id: messages.id, senderId: messages.senderId,
            body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt,
            senderName: users.displayName,
          })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderId))
          .where(eq(messages.conversationId, activeId))
          .orderBy(asc(messages.createdAt));
        const subject = convoRows.find((r) => r.id === activeId)?.subject ?? "";

        const senderIds = Array.from(new Set(threadMsgs.map((m) => m.senderId)));
        const participants: Sender[] = senderIds.map((id) => {
          if (id === user.id) return { id, name: "You" };
          const found = threadMsgs.find((m) => m.senderId === id);
          return { id, name: found?.senderName ?? "Honoré Tax & Wealth" };
        });

        activeThread = {
          id: activeId,
          subject,
          participants,
          messages: threadMsgs.map((m) => ({
            id: m.id,
            conversationId: activeId,
            senderId: m.senderId,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            readAt: m.readAt ? m.readAt.toISOString() : null,
          })),
        };
        initialMessages = activeThread.messages;
      }
    }
  } catch {
    // best-effort
  }

  return (
    <DashboardShell
      audience="Client"
      title="Chat with your preparer"
      description="Real-time messages. Type a reply and it appears instantly."
      nav={nav}
      userLabel={user.displayName ?? user.email}
      currentHref="/dashboard/client/messages"
    >
      <ChatClient
        initialThreads={threads}
        initialThread={activeThread}
        initialMessages={initialMessages}
        currentUserId={user.id}
        counts={counts}
      />
    </DashboardShell>
  );
}