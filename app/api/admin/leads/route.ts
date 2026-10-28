import { z } from "zod";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "name").max(100),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  service: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(60).optional(),
});

const MAX_BODY_BYTES = 8_000;

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin "New lead" capture. Creates a row in `leads` and bounces back to the
 * /dashboard/admin/leads page. Accepts form-urlencoded OR JSON so the
 * client page can use either a native form submit or a fetch().
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

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("lead.create.validation_failed", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const [row] = await getDb()
      .insert(leads)
      .values({
        name: payload.name,
        email: payload.email,
        phone: payload.phone || null,
        service: payload.service || null,
        notes: payload.notes || null,
        source: payload.source || "admin-create",
        stage: "new",
        ownerId: user.id,
      })
      .returning({ id: leads.id });
    logEvent("lead.create.success", { userId: user.id, leadId: row?.id });
  } catch (error) {
    logEvent("lead.create.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  // If submitted as a native form (no fetch headers), redirect back.
  if (!contentType.includes("application/json")) {
    revalidatePath("/dashboard/admin/leads");
    return seeOther("/dashboard/admin/leads");
  }

  revalidatePath("/dashboard/admin/leads");
  return Response.json({ ok: true });
}
