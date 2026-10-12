import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, conversations, messages, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fetches a single thread's full history. Used when the client switches
 * between threads from the sidebar.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { id: conversationId } = await ctx.params;
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const own = await db
      .select({ id: clientAccess.clientId, subject: conversations.subject })
      .from(conversations)
      .innerJoin(clientAccess, and(eq(clientAccess.clientId, conversations.clientId), eq(clientAccess.userId, user.id)))
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (own.length === 0) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

    const threadMsgs = await db
      .select({
        id: messages.id, senderId: messages.senderId,
        body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt,
        senderName: users.displayName,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    // Clear unread on read.
    await db.update(conversations).set({ clientUnreadCount: 0 }).where(eq(conversations.id, conversationId));

    const senderIds = Array.from(new Set(threadMsgs.map((m) => m.senderId)));
    const participants = senderIds.map((id) => {
      if (id === user.id) return { id, name: "You" };
      const found = threadMsgs.find((m) => m.senderId === id);
      return { id, name: found?.senderName ?? "Honore Tax & Wealth" };
    });

    return Response.json({
      ok: true,
      thread: {
        id: conversationId,
        subject: own[0].subject,
        participants,
        messages: threadMsgs.map((m) => ({
          id: m.id,
          conversationId,
          senderId: m.senderId,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          readAt: m.readAt ? m.readAt.toISOString() : null,
        })),
      },
    });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}