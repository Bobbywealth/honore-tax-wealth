import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, documents } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Authenticated document download for clients.
 *
 * The file is streamed from the storage abstraction — never a public URL.
 * Access is scoped to the caller's own client record via client_access.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "client") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const accessRows = await db
      .select({ clientId: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, user.id))
      .limit(1);
    const clientId = accessRows[0]?.clientId;
    if (!clientId) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.clientId, clientId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    const doc = rows[0];
    if (!doc) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const { data } = await storage().get(doc.storageKey);
    logEvent("document.download", { userId: user.id, docId: id });

    // Force download; never render inline (prevents content-sniffing issues).
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
      userId: user.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
