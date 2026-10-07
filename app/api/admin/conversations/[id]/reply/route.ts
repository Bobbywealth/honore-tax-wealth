import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversations, messages } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  body: z.string().trim().min(2).max(4000),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { id: conversationId } = await ctx.params;
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let payload: z.infer<typeof schema>;
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const convo = await db
      .select({ id: conversations.id, clientId: conversations.clientId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (convo.length === 0) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

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
        clientUnreadCount: sql`${conversations.clientUnreadCount} + 1`,
        staffUnreadCount: 0,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));

    logEvent("admin.conversation.reply.sent", { userId: user.id, conversationId });
  } catch (error) {
    logEvent("admin.conversation.reply.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/messages");
  if (!contentType.includes("application/json")) {
    return Response.redirect(new URL(`/dashboard/admin/messages?thread=${conversationId}`, request.url), 303);
  }
  return Response.json({ ok: true });
}

// Local imports re-exported for the inline SQL used above.
import { sql } from "drizzle-orm";