import { z } from "zod";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { primaryClientFor } from "@/lib/access";
import { consumeRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

// Rate limit: 10 appointment requests per user per 10 minutes.
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 600;

const TOPICS = [
  "Quick question",
  "Document review",
  "Tax planning call",
  "IRS notice help",
  "Other",
] as const;

const MEETING_TYPES = ["phone", "video", "in_person"] as const;

const MEETING_LABEL: Record<(typeof MEETING_TYPES)[number], string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In person",
};

const schema = z.object({
  topic: z.enum(TOPICS),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  meetingType: z.enum(MEETING_TYPES),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function getNyOffsetMs(at: Date): number {
  // How far behind UTC is America/New_York at the given moment?
  // Positive when NY is behind UTC (always, for this timezone).
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
  // Interpret the form's date+time as a wall-clock time in America/New_York,
  // respecting daylight saving time. A fixed -05:00 offset is wrong during
  // EDT (UTC-4), shifting displayed times by an hour.
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  return new Date(asUtc.getTime() + getNyOffsetMs(asUtc));
}

/** Today's date as YYYY-MM-DD in America/New_York. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Logged-in client appointment request. Resolves the caller's own client
 * record server-side (never trusts a client-supplied clientId) and inserts
 * an appointment with status "requested" for staff to confirm.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  try {
    const limit = await consumeRateLimit(`client-appt-req:${user.id}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!limit.allowed) {
      logEvent("client.appointment.rate_limited", { userId: user.id });
      return Response.json({ ok: false, error: "rate_limited" }, {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      });
    }
  } catch {
    // A rate-limit store failure must never block a legitimate request.
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    logEvent("client.appointment.validation_failed", { userId: user.id });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  if (payload.preferredDate < todayKey()) {
    return Response.json({ ok: false, error: "date_in_past" }, { status: 400 });
  }

  let startsAt: Date;
  try {
    startsAt = combineDateTime(payload.preferredDate, payload.preferredTime);
  } catch {
    return Response.json({ ok: false, error: "invalid_datetime" }, { status: 400 });
  }
  if (Number.isNaN(startsAt.getTime())) {
    return Response.json({ ok: false, error: "invalid_datetime" }, { status: 400 });
  }
  // Default duration for a client-requested appointment: 30 minutes.
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  try {
    await ensureMigrated();
    const clientId = await primaryClientFor(user);
    if (!clientId) {
      return Response.json({ ok: false, error: "no_client_profile" }, { status: 409 });
    }
    const notesParts = [`Preferred meeting type: ${MEETING_LABEL[payload.meetingType]}.`];
    if (payload.notes) notesParts.push(payload.notes);
    const [row] = await getDb()
      .insert(appointments)
      .values({
        clientId,
        title: `Appointment request — ${payload.topic}`,
        status: "requested",
        startsAt,
        endsAt,
        timezone: "America/New_York",
        location: MEETING_LABEL[payload.meetingType],
        notes: notesParts.join("\n"),
      })
      .returning({ id: appointments.id });
    logEvent("client.appointment.created", { userId: user.id, clientId, appointmentId: row?.id });
    revalidatePath("/dashboard/client/appointments");
    return Response.json({ ok: true, id: row?.id });
  } catch (error) {
    logEvent("client.appointment.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
