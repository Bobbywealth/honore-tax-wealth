import { redirect } from "next/navigation";
import DashboardShell from "../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { clients, conversations, messages, users } from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import StaffChatClient from "./StaffChatClient";

export const dynamic = "force-dynamic";

async function loadCounts() {
  if (!process.env.DATABASE_URL) {
    return { unanswered: 0, openAppointments: 0, activeReturns: 0, leadsTotal: 0, conversationsUnread: 0 };
  }
  try {
    await ensureMigrated();
    const db = getDb();
    const schema = await import("@/db/schema");
    const [u, a, r, l, c] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(schema.consultations).where(sql`${schema.consultations.status} = 'new'`),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.appointments).where(sql`${schema.appointments.status} IN ('requested','confirmed')`),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.returns).where(sql`${schema.returns.stage} NOT IN ('vendor','prepared','submitted','complete')`),
      db.select({ c: sql<number>`count(*)::int` }).from(schema.leads),
      db.select({ c: sql<number>`coalesce(sum(${schema.conversations.staffUnreadCount}), 0)::int` }).from(schema.conversations),
    ]);
    return {
      unanswered: u[0]?.c ?? 0,
      openAppointments: a[0]?.c ?? 0,
      activeReturns: r[0]?.c ?? 0,
      leadsTotal: l[0]?.c ?? 0,
      conversationsUnread: Number(c[0]?.c ?? 0),
    };
  } catch {
    return { unanswered: 0, openAppointments: 0, activeReturns: 0, leadsTotal: 0, conversationsUnread: 0 };
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
  clientId: string;
  clientName: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { senderName: string; body: string; createdAt: string } | null;
};

function buildAdminNav(counts: { unanswered: number; conversationsUnread: number }) {
  // Inline admin nav — same shape DashboardShell expects.
  return [
    { href: "/dashboard/admin", label: "Dashboard" },
    {
      href: "/dashboard/admin/inbox",
      label: "Inbox",
      badge: counts.unanswered > 0 ? { value: counts.unanswered, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/admin/messages",
      label: "Messages",
      badge: counts.conversationsUnread > 0 ? { value: counts.conversationsUnread, tone: "red" as const } : undefined,
    },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/admin/returns", label: "Returns" },
    { href: "/dashboard/admin/documents", label: "Documents" },
    { href: "/dashboard/admin/tasks", label: "Tasks" },
    { href: "/dashboard/admin/calendar", label: "Calendar" },
    { href: "/dashboard/admin/leads", label: "Leads" },
    { href: "/dashboard/admin/reports", label: "Reports" },
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/admin/settings", label: "Settings" },
  ];
}

export default async function AdminMessagesPage({ searchParams }: { searchParams?: Promise<{ thread?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/admin/messages");
  if (user.role === "client") redirect("/dashboard/client");
  if (user.role !== "admin") {
    // Non-admin staff don't get access to the inter-staff message board.
    return (
      <main className="adm-restricted">
        <p>Admins only. This page is not available to agents.</p>
        <a href="/dashboard/admin">Back to dashboard</a>
      </main>
    );
  }

  const counts = await loadCounts();
  const nav = buildAdminNav(counts);

  let threads: Thread[] = [];
  let activeThread: { id: string; subject: string; clientId: string; clientName: string; messages: ChatMessage[]; participants: Sender[] } | null = null;
  let initialMessages: ChatMessage[] = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      const params = (await searchParams) ?? {};
      const requestedId = params.thread;

      const convoRows = await db
        .select({
          id: conversations.id, subject: conversations.subject,
          clientId: conversations.clientId, clientName: clients.displayName,
          lastMessageAt: conversations.lastMessageAt, unread: conversations.staffUnreadCount,
        })
        .from(conversations)
        .innerJoin(clients, eq(clients.id, conversations.clientId))
        .orderBy(desc(conversations.lastMessageAt));

      const convoIds = convoRows.map((c) => c.id);

      const lastMsgs = convoIds.length
        ? await db
            .select({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt, senderName: users.displayName })
            .from(messages)
            .leftJoin(users, eq(users.id, messages.senderId))
            .where(inArray(messages.conversationId, convoIds))
            .orderBy(desc(messages.createdAt))
            .limit(800)
        : [];
      const lastByConvo = new Map<string, typeof lastMsgs[number]>();
      for (const m of lastMsgs) if (!lastByConvo.has(m.conversationId)) lastByConvo.set(m.conversationId, m);

      threads = convoRows.map((c) => {
        const last = lastByConvo.get(c.id);
        return {
          id: c.id, subject: c.subject,
          clientId: c.clientId, clientName: c.clientName,
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
          unread: c.unread,
          lastMessage: last ? {
            senderName: last.senderName ?? "Client",
              body: last.body,
              createdAt: last.createdAt.toISOString(),
            } : null,
        };
      });

      const activeId = requestedId ?? threads[0]?.id;
      if (activeId && convoIds.includes(activeId)) {
        const convo = convoRows.find((r) => r.id === activeId);
        const threadMsgs = await db
          .select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt, senderName: users.displayName })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderId))
          .where(eq(messages.conversationId, activeId))
          .orderBy(asc(messages.createdAt));
        const senderIds = Array.from(new Set(threadMsgs.map((m) => m.senderId)));
        const participants: Sender[] = senderIds.map((id) => {
          if (id === user.id) return { id, name: "You" };
          const found = threadMsgs.find((m) => m.senderId === id);
          return { id, name: found?.senderName ?? "Client" };
        });
        activeThread = {
          id: activeId,
          subject: convo?.subject ?? "",
          clientId: convo?.clientId ?? "",
          clientName: convo?.clientName ?? "",
          participants,
          messages: threadMsgs.map((m) => ({
            id: m.id, conversationId: activeId, senderId: m.senderId,
            body: m.body, createdAt: m.createdAt.toISOString(),
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
      audience="Admin"
      title="Client messages"
      description="Every client thread in one place. Reply inline; the client sees it instantly."
      nav={nav}
      userLabel={user.displayName ?? user.email}
      currentHref="/dashboard/admin/messages"
    >
      <StaffChatClient
        initialThreads={threads}
        initialThread={activeThread}
        initialMessages={initialMessages}
        currentUserId={user.id}
        currentUserName={user.displayName ?? user.email}
        counts={counts}
      />
    </DashboardShell>
  );
}