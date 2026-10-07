import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, conversations, messages } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  body: z.string().trim().min(2).max(4000),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Client replies to an existing conversation thread. Bumps staffUnreadCount
 * and lastMessageAt, clears clientUnreadCount.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { id: conversationId } = await ctx.params;
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("client.conversation.reply.validation_failed", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    // Authorization: confirm this user is linked to the conversation's client.
    const rows = await db
      .select({ clientId: clientAccess.clientId })
      .from(conversations)
      .innerJoin(clientAccess, and(eq(clientAccess.clientId, conversations.clientId), eq(clientAccess.userId, user.id)))
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const now = new Date();
    await db.insert(messages).values({
      conversationId,
      senderId: user.id,
      body: payload.body,
    });
    await db
      .update(conversations)
      .set({
        lastMessageAt: now,
        clientUnreadCount: 0,
        staffUnreadCount: sql`${conversations.staffUnreadCount} + 1`,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));

    logEvent("client.conversation.reply.sent", { userId: user.id, conversationId });
  } catch (error) {
    logEvent("client.conversation.reply.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/client/messages");
  if (!contentType.includes("application/json")) {
    return Response.redirect(new URL(`/dashboard/client/messages?thread=${conversationId}`, request.url), 303);
  }
  return Response.json({ ok: true });
}