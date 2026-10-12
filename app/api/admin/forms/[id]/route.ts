import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signableDocuments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.object({ id: z.string().uuid() });

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin cancels a signable document. The row is soft-voided (status
 * flips to 'cancelled', cancelled_at set) instead of hard-deleted so
 * the existing signatures stay in the audit trail.
 *
 * Idempotent: re-cancelling an already-cancelled document returns ok.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("admin", "staff", "assistant");
  if (!actor) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const parsed = idSchema.safeParse(await ctx.params);
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });

  try {
    await ensureMigrated();
    const db = getDb();

    const [row] = await db
      .select({ id: signableDocuments.id, status: signableDocuments.status })
      .from(signableDocuments)
      .where(eq(signableDocuments.id, parsed.data.id))
      .limit(1);
    if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    if (row.status === "cancelled") return Response.json({ ok: true, alreadyCancelled: true });

    await db
      .update(signableDocuments)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        updatedAt: new Date(),
      })
      .where(and(eq(signableDocuments.id, parsed.data.id), eq(signableDocuments.status, "pending")));

    logEvent("forms.cancel.success", { actor: actor.id, formId: parsed.data.id });
    revalidatePath("/dashboard/admin/forms");
    revalidatePath(`/dashboard/admin/forms/${parsed.data.id}`);
    revalidatePath("/dashboard/client");
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("forms.cancel.db_error", { actor: actor.id, err: String((error as Error).message) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
