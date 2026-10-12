import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { currentUser } from "@/lib/auth";
import DashboardShell from "../../DashboardShell";
import { clientNav } from "../_lib/nav";
import { getDb } from "@/db";
import { conversations, messages } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { primaryClientFor } from "@/lib/access";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import MessagesClient from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function ClientMessagesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/messages");

  const clientId = await primaryClientFor(user);

  // No client record yet -- fall back to the Overview rather than crash here.
  if (!clientId) redirect("/dashboard/client");

  let threads: Array<{ id: string; subject: string; lastMessageAt: string | null; unread: number; lastMessage: { senderName: string; body: string; createdAt: string } | null }> = [];
  let initialMessagesByThread: Record<string, Array<{ id: string; conversationId: string; senderId: string; body: string; createdAt: string; readAt: string | null; senderName: string }>> = {};
  let counts = { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0, unreadMessages: 0 };
  let available = true;

  try {
    if (!process.env.DATABASE_URL) {
      available = false;
    } else {
      await ensureMigrated();
      const db = getDb();
      const convoRows = await db
        .select({
          id: conversations.id,
          subject: conversations.subject,
          lastMessageAt: conversations.lastMessageAt,
          unread: conversations.clientUnreadCount,
        })
        .from(conversations)
        .where(eq(conversations.clientId, clientId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(50);

      const convoIds = convoRows.map((c) => c.id);
      const messageRows = convoIds.length
        ? await db
            .select({
              id: messages.id,
              conversationId: messages.conversationId,
              senderId: messages.senderId,
              body: messages.body,
              createdAt: messages.createdAt,
              readAt: messages.readAt,
            })
            .from(messages)
            .where(inArray(messages.conversationId, convoIds))
            .orderBy(desc(messages.createdAt))
            .limit(500)
        : [];

      const senderIds = Array.from(new Set(messageRows.map((m) => m.senderId)));
      const senderNames: Record<string, string> = {};
      // Sender-name lookups stay best-effort. The floating ChatLauncher uses
      // an opaque id when the lookup is missing, so we follow that convention
      // here. The current user always maps to their displayName.
      senderNames[user.id] = user.displayName ?? user.email ?? "You";

      // Build thread summaries
      for (const c of convoRows) {
        const last = messageRows.find((m) => m.conversationId === c.id);
        if (last) {
          (c as unknown as { lastMessage?: { senderName: string; body: string; createdAt: string } }).lastMessage = {
            senderName: senderNames[last.senderId] ?? "Honore Tax & Wealth",
            body: last.body,
            createdAt: new Date(last.createdAt).toISOString(),
          };
        }
      }

      initialMessagesByThread = {};
      for (const m of messageRows) {
        if (!initialMessagesByThread[m.conversationId]) initialMessagesByThread[m.conversationId] = [];
        initialMessagesByThread[m.conversationId].push({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          body: m.body,
          createdAt: new Date(m.createdAt).toISOString(),
          readAt: m.readAt ? new Date(m.readAt).toISOString() : null,
          senderName: senderNames[m.senderId] ?? "Honore Tax & Wealth",
        });
      }
      for (const id of Object.keys(initialMessagesByThread)) {
        initialMessagesByThread[id].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }

      threads = convoRows.map((c) => ({
        id: c.id,
        subject: c.subject || "Conversation",
        lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : null,
        unread: c.unread ?? 0,
        lastMessage: (c as unknown as { lastMessage?: { senderName: string; body: string; createdAt: string } | null }).lastMessage ?? null,
      }));

      counts = {
        activeEngagements: 0,
        openRequests: 0,
        upcomingAppointments: 0,
        unpaidInvoices: 0,
        unreadMessages: threads.reduce((s, t) => s + (t.unread > 0 ? 1 : 0), 0),
      };
    }
  } catch {
    available = false;
  }

  const nav = clientNav(counts);

  return (
    <DashboardShell
      audience="Client"
      title="Messages"
      description="Every conversation with your preparer in one place."
      nav={nav}
      userLabel={user.displayName ?? user.email}
      currentHref="/dashboard/client/messages"
    >
      <div className="dashboard-alert" style={{ marginBottom: 16 }}>
        <p>
          <strong><Link href="/dashboard/client" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span aria-hidden="true">←</span> Back to overview</Link></strong>
          {" \u2014 you can also use the floating chat button on every portal page."}
        </p>
      </div>

      {available ? (
        <MessagesClient currentUserId={user.id} currentUserName={user.displayName ?? user.email ?? "You"} threads={threads} initialMessagesByThread={initialMessagesByThread} />
      ) : (
        <div className="dashboard-empty">
          <MessageSquareText size={22} aria-hidden="true" />
          <h3>Messages are temporarily unavailable</h3>
          <p>Nothing has been lost. Try refreshing, and contact the team if the issue keeps happening.</p>
        </div>
      )}
    </DashboardShell>
  );
}
