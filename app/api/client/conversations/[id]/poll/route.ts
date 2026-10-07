import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, conversations, messages, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint for the client chat. Returns any messages
 * whose createdAt is strictly greater than `since` (an ISO timestamp).
 * Also returns the thread's lastMessageAt so the client can update its
 * sidebar badge without re-listing.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, messages: [] });

  const { id: conversationId } = await ctx.params;
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");

  try {
    await ensureMigrated();
    const db = getDb();

    // Authorization.
    const own = await db
      .select({ id: clientAccess.clientId })
      .from(conversations)
      .innerJoin(clientAccess, and(eq(clientAccess.clientId, conversations.clientId), eq(clientAccess.userId, user.id)))
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (own.length === 0) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

    const baseWhere = eq(messages.conversationId, conversationId);
    const newerRows = since
      ? await db
          .select({
            id: messages.id, conversationId: messages.conversationId,
            senderId: messages.senderId, body: messages.body,
            createdAt: messages.createdAt, readAt: messages.readAt,
            senderName: users.displayName,
          })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderId))
          .where(and(baseWhere, gt(messages.createdAt, new Date(since))))
          .orderBy(asc(messages.createdAt))
          .limit(50)
      : [];

    const convo = await db
      .select({ lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return Response.json({
      ok: true,
      messages: newerRows.map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        senderId: r.senderId,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        senderName: r.senderName,
      })),
      threadLastMessageAt: convo[0]?.lastMessageAt ? convo[0].lastMessageAt.toISOString() : null,
    });
  } catch {
    return Response.json({ ok: true, messages: [] });
  }
}