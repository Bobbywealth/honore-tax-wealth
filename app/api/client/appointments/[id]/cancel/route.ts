import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, clientAccess } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Client cancels one of their own appointments (e.g. from the
 * "Reschedule" button on the appointments page). In production this would
 * open a confirmation flow; for now it marks the slot cancelled and bumps
 * staffUnreadCount via the same channel.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
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
    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .innerJoin(clientAccess, and(eq(clientAccess.clientId, appointments.clientId), eq(clientAccess.userId, user.id)))
      .where(eq(appointments.id, id))
      .limit(1);
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await db
      .update(appointments)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: payload.reason || "client rescheduled",
      })
      .where(eq(appointments.id, id));
    logEvent("client.appointment.canceled", { userId: user.id, appointmentId: id });
  } catch (error) {
    logEvent("client.appointment.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  revalidatePath("/dashboard/client/appointments");
  revalidatePath("/dashboard/client");
  if (!contentType.includes("application/json")) {
    return Response.redirect(new URL("/dashboard/client/appointments", request.url), 303);
  }
  return Response.json({ ok: true });
}