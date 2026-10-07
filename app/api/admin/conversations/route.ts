import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, conversations, messages, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff-side listing endpoint. Returns every conversation across all clients
 * with the latest message preview and the unread-for-staff count. Polled by
 * the staff chat inbox so it refreshes without a page reload.
 */
export async function GET(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, threads: [] });

  const url = new URL(request.url);
  const search = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "all").toLowerCase();

  try {
    await ensureMigrated();
    const db = getDb();

    const convoRows = await db
      .select({
        id: conversations.id,
        subject: conversations.subject,
        clientId: conversations.clientId,
        clientName: clients.displayName,
        lastMessageAt: conversations.lastMessageAt,
        unread: conversations.staffUnreadCount,
      })
      .from(conversations)
      .innerJoin(clients, eq(clients.id, conversations.clientId))
      .orderBy(desc(conversations.lastMessageAt));

    let filtered = convoRows;
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      filtered = filtered.filter((r) => r.subject.toLowerCase().includes(q) || r.clientName.toLowerCase().includes(q));
    }
    if (status === "unread") filtered = filtered.filter((r) => r.unread > 0);
    if (status === "open") filtered = filtered.filter((r) => r.unread > 0 || (r.lastMessageAt && Date.now() - new Date(r.lastMessageAt).getTime() < 7 * 24 * 60 * 60 * 1000));

    const convoIds = filtered.map((c) => c.id);
    const lastMsgs = convoIds.length
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
          .limit(800)
      : [];
    const lastByConvo = new Map<string, typeof lastMsgs[number]>();
    for (const m of lastMsgs) if (!lastByConvo.has(m.conversationId)) lastByConvo.set(m.conversationId, m);

    return Response.json({
      ok: true,
      threads: filtered.slice(0, 100).map((c) => {
        const last = lastByConvo.get(c.id);
        return {
          id: c.id,
          subject: c.subject,
          clientId: c.clientId,
          clientName: c.clientName,
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
          unread: c.unread,
          lastMessage: last ? {
            senderName: last.senderName ?? "Client",
            body: last.body,
            createdAt: last.createdAt.toISOString(),
          } : null,
        };
      }),
      totals: {
        all: convoRows.length,
        unread: convoRows.filter((r) => r.unread > 0).length,
      },
    });
  } catch {
    return Response.json({ ok: true, threads: [] });
  }
}