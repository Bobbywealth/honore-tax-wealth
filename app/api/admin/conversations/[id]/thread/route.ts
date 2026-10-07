import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, conversations, messages, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff thread fetch: returns the full message history for one conversation
 * plus its subject, clientId, and clientName. Clears staffUnreadCount so the
 * sidebar badge updates after the staff opens the thread.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const convoRows = await db
      .select({
        id: conversations.id,
        subject: conversations.subject,
        clientId: conversations.clientId,
        clientName: clients.displayName,
      })
      .from(conversations)
      .innerJoin(clients, eq(clients.id, conversations.clientId))
      .where(eq(conversations.id, id))
      .limit(1);
    if (convoRows.length === 0) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

    const threadMsgs = await db
      .select({
        id: messages.id, senderId: messages.senderId,
        body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt,
        senderName: users.displayName,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    // Clear staffUnreadCount on read.
    await db.update(conversations).set({ staffUnreadCount: 0 }).where(eq(conversations.id, id));

    const senderIds = Array.from(new Set(threadMsgs.map((m) => m.senderId)));
    const participants = senderIds.map((sid) => {
      if (sid === user.id) return { id: sid, name: "You" };
      const found = threadMsgs.find((m) => m.senderId === sid);
      return { id: sid, name: found?.senderName ?? "Client" };
    });

    return Response.json({
      ok: true,
      thread: {
        id: convoRows[0].id,
        subject: convoRows[0].subject,
        clientId: convoRows[0].clientId,
        clientName: convoRows[0].clientName,
        participants,
        messages: threadMsgs.map((m) => ({
          id: m.id, conversationId: id, senderId: m.senderId,
          body: m.body, createdAt: m.createdAt.toISOString(),
          readAt: m.readAt ? m.readAt.toISOString() : null,
        })),
      },
    });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}