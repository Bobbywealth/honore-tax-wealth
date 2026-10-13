import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Confirm a requested appointment (requested → confirmed). Staff and admins
 * only. Native form POST redirects back to the calendar; JSON returns
 * { ok: true }.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "staff");
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

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({ id: appointments.id, status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    if (rows.length === 0) {
      if (!isJson) {
        return Response.redirect(new URL("/dashboard/admin/calendar?error=notfound", request.url), 303);
      }
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await getDb()
      .update(appointments)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(appointments.id, id));
    logEvent("appointment.confirmed", { userId: user.id, appointmentId: id, from: rows[0].status });
  } catch (error) {
    logEvent("appointment.confirm.db_error", { userId: user.id, appointmentId: id, err: (error as Error).message });
    if (!isJson) {
      return Response.redirect(new URL("/dashboard/admin/calendar?error=db", request.url), 303);
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/admin/calendar");
  if (!isJson) {
    return Response.redirect(new URL("/dashboard/admin/calendar?confirmed=1", request.url), 303);
  }
  return Response.json({ ok: true });
}
