import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, engagements, internalNotes } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Confirm the caller may see this client: admins see all; non-admin staff
 * see only clients they are assigned to (clients.owner_id or an engagement
 * owner_id). Returns the client id or null.
 */
async function authorizedClientId(
  user: { id: string; role: string },
  clientId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, ownerId: clients.ownerId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.ownerId === user.id) return true;
  const eng = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(
      and(
        eq(engagements.clientId, clientId),
        eq(engagements.ownerId, user.id),
        isNull(engagements.archivedAt),
      ),
    )
    .limit(1);
  return eng.length > 0;
}

const postSchema = z.object({
  body: z.string().trim().min(1, "body").max(5000, "body"),
});

/** List internal notes for a client. Staff only; never exposed to clients. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    await ensureMigrated();
    if (!(await authorizedClientId(user, id))) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const rows = await getDb()
      .select({
        id: internalNotes.id,
        authorName: internalNotes.authorName,
        authorRole: internalNotes.authorRole,
        body: internalNotes.body,
        createdAt: internalNotes.createdAt,
      })
      .from(internalNotes)
      .where(eq(internalNotes.clientId, id))
      .orderBy(desc(internalNotes.createdAt))
      .limit(100);

    return Response.json({ ok: true, notes: rows });
  } catch (err) {
    logEvent("notes.list.error", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Add an internal note. Staff only; clients can never see these. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let payload: z.infer<typeof postSchema>;
  try {
    payload = postSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    if (!(await authorizedClientId(user, id))) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const [note] = await getDb()
      .insert(internalNotes)
      .values({
        clientId: id,
        authorId: user.id,
        authorName: user.displayName ?? user.email,
        authorRole: user.role,
        body: payload.body,
      })
      .returning({ id: internalNotes.id, createdAt: internalNotes.createdAt });

    await audit(user, "note.created", "client", id, { noteId: note.id });
    logEvent("notes.created", { userId: user.id, clientId: id });
    return Response.json({ ok: true, id: note.id });
  } catch (err) {
    logEvent("notes.create.error", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
