import { z } from "zod";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_000;

const schema = z.object({
  status: z.enum(["new", "in_progress", "waiting_on_client", "closed"]),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Change a consultation request's status. Staff and admins only.
 * Accepts a native form POST (redirects back to the inbox detail) or
 * JSON (returns { ok: true }).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!id || !Number.isInteger(numericId) || numericId <= 0) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
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
  } catch {
    logEvent("inbox.status.validation_failed", { userId: user.id, inboxId: numericId });
    if (!isJson) {
      return seeOther(`/dashboard/admin/inbox?id=${numericId}&error=invalid`);
    }
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({ id: consultations.id })
      .from(consultations)
      .where(eq(consultations.id, numericId))
      .limit(1);
    if (rows.length === 0) {
      if (!isJson) {
        return seeOther("/dashboard/admin/inbox?error=notfound");
      }
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await getDb()
      .update(consultations)
      .set({ status: payload.status })
      .where(eq(consultations.id, numericId));
    logEvent("inbox.status.changed", { userId: user.id, inboxId: numericId, to: payload.status });
  } catch (error) {
    logEvent("inbox.status.db_error", { userId: user.id, inboxId: numericId, err: (error as Error).message });
    if (!isJson) {
      return seeOther(`/dashboard/admin/inbox?id=${numericId}&error=db`);
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/inbox");
  if (!isJson) {
    return seeOther(`/dashboard/admin/inbox?id=${numericId}&updated=1`);
  }
  return Response.json({ ok: true });
}
