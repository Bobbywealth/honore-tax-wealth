import { z } from "zod";
import { getDb } from "@/db";
import { returns } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_000;

/**
 * Canonical stage keys shown on the returns board, mapped to the primary
 * DB value stored in returns.stage. Mirrors the STAGES table in
 * app/dashboard/admin/returns/page.tsx.
 */
const STAGE_MAP: Record<string, string> = {
  intake: "intake",
  docs: "docs",
  in_prep: "in_prep",
  review: "review",
  approval: "approval",
  filed: "filed",
  rejected: "rejected",
};

const schema = z.object({
  stage: z.enum(Object.keys(STAGE_MAP) as [string, ...string[]]),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Move a return to a different pipeline stage. Staff and admins only.
 * Appends to the return's history JSONB. Native form POST redirects back
 * to the returns board; JSON returns { ok: true }.
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
    logEvent("return.stage.validation_failed", { userId: user.id, returnId: id });
    if (!isJson) {
      return Response.redirect(new URL("/dashboard/admin/returns?error=invalid", request.url), 303);
    }
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const dbStage = STAGE_MAP[payload.stage];

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({ id: returns.id, stage: returns.stage, history: returns.history })
      .from(returns)
      .where(eq(returns.id, id))
      .limit(1);
    if (rows.length === 0) {
      if (!isJson) {
        return Response.redirect(new URL("/dashboard/admin/returns?error=notfound", request.url), 303);
      }
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const prev = rows[0].history ?? [];
    const entry = { at: new Date().toISOString(), stage: dbStage, by: user.id };
    await getDb()
      .update(returns)
      .set({ stage: dbStage, history: [...prev, entry], updatedAt: new Date() })
      .where(eq(returns.id, id));
    logEvent("return.stage.changed", { userId: user.id, returnId: id, from: rows[0].stage, to: dbStage });
  } catch (error) {
    logEvent("return.stage.db_error", { userId: user.id, returnId: id, err: (error as Error).message });
    if (!isJson) {
      return Response.redirect(new URL("/dashboard/admin/returns?error=db", request.url), 303);
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/returns");
  if (!isJson) {
    return Response.redirect(new URL("/dashboard/admin/returns?moved=1", request.url), 303);
  }
  return Response.json({ ok: true });
}
