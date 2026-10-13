import { z } from "zod";
import { getDb } from "@/db";
import { documentRequests, clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

const schema = z.object({
  clientId: z.string().uuid("clientId"),
  title: z.string().trim().min(2, "title").max(200, "title"),
  description: z.string().trim().max(2000, "description").optional().or(z.literal("")),
  dueAt: z.string().trim().max(40).optional().or(z.literal("")),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin "New document request" — asks a client for a document. Accepts
 * form-urlencoded (native form POST, redirects back) or JSON
 * (returns { ok: true, id }).
 */
export async function POST(request: Request) {
  const user = await requireRole("admin", "staff", "assistant");
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

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let payload: z.infer<typeof schema>;
  try {
    const raw = isJson
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("docrequest.create.validation_failed", { userId: user.id, err: (error as Error).message });
    if (!isJson) {
      return Response.redirect(new URL("/dashboard/admin/documents?new=1&error=invalid", request.url), 303);
    }
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  let due: Date | null = null;
  if (payload.dueAt) {
    const d = new Date(payload.dueAt);
    if (!Number.isNaN(d.getTime())) due = d;
  }

  try {
    await ensureMigrated();
    // The client must exist (and not be archived).
    const cli = await getDb()
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, payload.clientId))
      .limit(1);
    if (cli.length === 0) {
      if (!isJson) {
        return Response.redirect(new URL("/dashboard/admin/documents?new=1&error=client", request.url), 303);
      }
      return Response.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }
    const [row] = await getDb()
      .insert(documentRequests)
      .values({
        clientId: payload.clientId,
        title: payload.title,
        description: payload.description || null,
        dueAt: due,
        createdById: user.id,
      })
      .returning({ id: documentRequests.id });
    logEvent("docrequest.create.success", { userId: user.id, requestId: row?.id, clientId: payload.clientId });
  } catch (error) {
    logEvent("docrequest.create.db_error", { userId: user.id, err: (error as Error).message });
    if (!isJson) {
      return Response.redirect(new URL("/dashboard/admin/documents?new=1&error=db", request.url), 303);
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/documents");
  if (!isJson) {
    return Response.redirect(new URL("/dashboard/admin/documents?created=1", request.url), 303);
  }
  return Response.json({ ok: true });
}
