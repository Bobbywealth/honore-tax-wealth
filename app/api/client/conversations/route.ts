import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, clients, conversations, messages } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

const schema = z.object({
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(4000),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Client posts a new message thread. Creates a conversation row and the
 * first message, then revalidates the client dashboard so the new thread
 * shows up immediately on the next render.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("client.conversation.validation_failed", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    // Resolve which client this user is allowed to message. For client
    // roles, take the first authorizedClientIds entry. Staff aren't allowed
    // through this route.
    const access = await getDb()
      .select({ clientId: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, user.id))
      .limit(1);
    if (access.length === 0) {
      return Response.json({ ok: false, error: "no_client_linked" }, { status: 403 });
    }
    const clientId = access[0].clientId;

    // Make sure the client row still exists.
    const cli = await getDb().select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
    if (cli.length === 0) {
      return Response.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }

    const [conv] = await getDb()
      .insert(conversations)
      .values({
        clientId,
        subject: payload.subject,
        lastMessageAt: new Date(),
        clientUnreadCount: 0,
        staffUnreadCount: 1,
      })
      .returning({ id: conversations.id });
    if (!conv) {
      return Response.json({ ok: false, error: "create_failed" }, { status: 500 });
    }

    await getDb().insert(messages).values({
      conversationId: conv.id,
      senderId: user.id,
      body: payload.body,
    });

    logEvent("client.conversation.created", { userId: user.id, clientId, conversationId: conv.id });
  } catch (error) {
    logEvent("client.conversation.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/client");
  if (!contentType.includes("application/json")) {
    return Response.redirect(new URL("/dashboard/client#checklist-title", request.url), 303);
  }
  return Response.json({ ok: true });
}
