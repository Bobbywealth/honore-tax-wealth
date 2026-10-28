import { z } from "zod";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_000;

const STAGES = ["new", "contacted", "consultation_scheduled", "proposal_sent", "won", "lost"] as const;

const schema = z.object({
  stage: z.enum(STAGES),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Move a lead to a different pipeline stage. Staff and admins only.
 * Native form POST redirects back to the leads board; JSON returns
 * { ok: true }.
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
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
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
    logEvent("lead.stage.validation_failed", { userId: user.id, leadId: id });
    if (!isJson) {
      return seeOther("/dashboard/admin/leads?error=invalid");
    }
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);
    if (rows.length === 0) {
      if (!isJson) {
        return seeOther("/dashboard/admin/leads?error=notfound");
      }
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await getDb()
      .update(leads)
      .set({ stage: payload.stage, updatedAt: new Date() })
      .where(eq(leads.id, id));
    logEvent("lead.stage.changed", { userId: user.id, leadId: id, from: rows[0].stage, to: payload.stage });
  } catch (error) {
    logEvent("lead.stage.db_error", { userId: user.id, leadId: id, err: (error as Error).message });
    if (!isJson) {
      return seeOther("/dashboard/admin/leads?error=db");
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/leads");
  if (!isJson) {
    return seeOther("/dashboard/admin/leads?moved=1");
  }
  return Response.json({ ok: true });
}
