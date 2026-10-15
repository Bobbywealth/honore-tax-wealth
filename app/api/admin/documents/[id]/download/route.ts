import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Authenticated document download for staff/admin.
 *
 * Staff visibility is governed by the existing access model: admins see all
 * clients; non-admin staff see only clients they are assigned to (via
 * clients.owner_id or an engagement owner_id). That check lives in the
 * caller's page/API; this route re-verifies the document exists and is not
 * deleted, and requires a staff role.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    await ensureMigrated();
    const { storage } = await import("@/lib/storage");
    const db = getDb();

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .limit(1);
    const doc = rows[0];
    if (!doc) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Non-admin staff: confirm assignment to this client, either directly
    // (clients.owner_id) or via a non-archived engagement they own.
    if (user.role !== "admin") {
      const { clients, engagements } = await import("@/db/schema");
      const { or } = await import("drizzle-orm");
      const clientRows = await db
        .select({ id: clients.id, ownerId: clients.ownerId })
        .from(clients)
        .where(eq(clients.id, doc.clientId))
        .limit(1);
      const crow = clientRows[0];
      let allowed = Boolean(crow && crow.ownerId === user.id);
      if (!allowed && crow) {
        const engRows = await db
          .select({ id: engagements.id })
          .from(engagements)
          .where(
            and(
              eq(engagements.clientId, doc.clientId),
              eq(engagements.ownerId, user.id),
              isNull(engagements.archivedAt),
            ),
          )
          .limit(1);
        allowed = engRows.length > 0;
      }
      if (!allowed) {
        logEvent("document.download.forbidden", { userId: user.id, docId: id });
        return Response.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    }

    const { data } = await storage().get(doc.storageKey);
    logEvent("document.download", { userId: user.id, docId: id, role: user.role });

    const safeName = doc.sanitizedFilename.replace(/"/g, "");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": doc.contentType,
        "content-length": String(data.length),
        "content-disposition": `attachment; filename="${safeName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    logEvent("document.download.error", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
