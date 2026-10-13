import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

const schema = z.object({
  title: z.string().trim().min(2).max(160),
  clientId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function getNyOffsetMs(at: Date): number {
  // How far behind UTC is America/New_York at the given moment?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const nyWallAsUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return at.getTime() - nyWallAsUtc;
}

function combineDateTime(date: string, time: string): Date {
  // Interprets the form's date+time as a wall-clock time in America/New_York,
  // respecting daylight saving time. A fixed -05:00 offset is wrong during
  // EDT (UTC-4), shifting displayed times by an hour.
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  return new Date(asUtc.getTime() + getNyOffsetMs(asUtc));
}

/**
 * Admin "New event" capture. Validates, checks the client exists and is
 * active, then inserts an appointment row. Returns 303 to the calendar.
 */
export async function POST(request: Request) {
  const user = await requireRole("admin", "staff");
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

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("appointment.create.validation_failed", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = combineDateTime(payload.date, payload.startsAt);
    endsAt = combineDateTime(payload.date, payload.endsAt);
  } catch {
    return Response.json({ ok: false, error: "invalid_datetime" }, { status: 400 });
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return Response.json({ ok: false, error: "invalid_datetime" }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return Response.json({ ok: false, error: "end_before_start" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const cli = await getDb()
      .select({ id: clients.id, status: clients.status })
      .from(clients)
      .where(eq(clients.id, payload.clientId))
      .limit(1);
    if (cli.length === 0) {
      return Response.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }
    if (cli[0].status !== "active") {
      return Response.json({ ok: false, error: "client_not_active" }, { status: 409 });
    }
    const [row] = await getDb()
      .insert(appointments)
      .values({
        clientId: payload.clientId,
        title: payload.title,
        status: "scheduled",
        startsAt,
        endsAt,
        timezone: "America/New_York",
        staffId: user.id,
        notes: payload.notes || null,
      })
      .returning({ id: appointments.id });
    logEvent("appointment.create.success", { userId: user.id, appointmentId: row?.id });
  } catch (error) {
    logEvent("appointment.create.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  if (!contentType.includes("application/json")) {
    revalidatePath("/dashboard/admin/calendar");
    return Response.redirect(new URL("/dashboard/admin/calendar", request.url), 303);
  }
  revalidatePath("/dashboard/admin/calendar");
  return Response.json({ ok: true });
}
