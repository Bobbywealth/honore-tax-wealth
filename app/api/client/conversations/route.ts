import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, conversations, messages, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(4000),
});

/**
 * GET — thread list (used by the chat's polling cycle to refresh the
 * sidebar without a page reload).
 * POST — create a new conversation + first message.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, threads: [] });

  try {
    await ensureMigrated();
    const db = getDb();

    const access = await db
      .select({ clientId: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, user.id))
      .limit(1);
    if (access.length === 0) return Response.json({ ok: true, threads: [] });
    const clientId = access[0].clientId;

    const convoRows = await db
      .select({
        id: conversations.id, subject: conversations.subject,
        lastMessageAt: conversations.lastMessageAt, unread: conversations.clientUnreadCount,
      })
      .from(conversations)
      .where(eq(conversations.clientId, clientId))
      .orderBy(desc(conversations.lastMessageAt));

    const convoIds = convoRows.map((c) => c.id);
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
          .limit(400)
      : [];
    const lastByConvo = new Map<string, typeof lastMsgs[number]>();
    for (const m of lastMsgs) if (!lastByConvo.has(m.conversationId)) lastByConvo.set(m.conversationId, m);

    return Response.json({
      ok: true,
      threads: convoRows.map((c) => {
        const last = lastByConvo.get(c.id);
        return {
          id: c.id, subject: c.subject,
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
          unread: c.unread,
          lastMessage: last ? {
            senderName: last.senderName ?? "Honore Tax & Wealth",
            body: last.body,
            createdAt: last.createdAt.toISOString(),
          } : null,
        };
      }),
    });
  } catch {
    return Response.json({ ok: true, threads: [] });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const contentType = request.headers.get("content-type") ?? "";
  let payload: z.infer<typeof createBodySchema>;
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = createBodySchema.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const access = await db
      .select({ clientId: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, user.id))
      .limit(1);
    if (access.length === 0) return Response.json({ ok: false, error: "no_client_linked" }, { status: 403 });
    const clientId = access[0].clientId;

    const [conv] = await db
      .insert(conversations)
      .values({
        clientId,
        subject: payload.subject,
        lastMessageAt: new Date(),
        clientUnreadCount: 0,
        staffUnreadCount: 1,
      })
      .returning({ id: conversations.id });
    if (!conv) return Response.json({ ok: false, error: "create_failed" }, { status: 500 });

    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: user.id,
      body: payload.body,
    });

    revalidatePath("/dashboard/client/messages");
    if (!contentType.includes("application/json")) {
      return Response.redirect(new URL(`/dashboard/client/messages?thread=${conv.id}`, request.url), 303);
    }
    return Response.json({ ok: true, conversationId: conv.id });
  } catch (error) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "client.conversation.create.error", err: (error as Error).message }));
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}