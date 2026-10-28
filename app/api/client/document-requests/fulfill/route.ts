import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, documentRequests } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().uuid(),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Client marks a document request as uploaded. We do not store the file here —
 * secure upload requires the storage credentials to be configured. This is
 * the explicit "I sent this to you separately" handoff until uploads are live.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const contentType = request.headers.get("content-type") ?? "";
  let payload: z.infer<typeof schema>;
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    // Confirm the request belongs to this user.
    const rows = await db
      .select({ id: documentRequests.id })
      .from(documentRequests)
      .innerJoin(clientAccess, and(eq(clientAccess.clientId, documentRequests.clientId), eq(clientAccess.userId, user.id)))
      .where(and(eq(documentRequests.id, payload.id), isNull(documentRequests.fulfilledAt)))
      .limit(1);
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "not_found_or_fulfilled" }, { status: 404 });
    }

    await db
      .update(documentRequests)
      .set({ fulfilledAt: new Date() })
      .where(eq(documentRequests.id, payload.id));
    logEvent("client.document_request.fulfilled", { userId: user.id, requestId: payload.id });
  } catch (error) {
    logEvent("client.document_request.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/client/documents");
  revalidatePath("/dashboard/client");
  if (!contentType.includes("application/json")) {
    return seeOther("/dashboard/client/documents");
  }
  return Response.json({ ok: true });
}