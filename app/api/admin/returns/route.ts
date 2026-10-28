import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, engagements, returns, taxYears } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

const schema = z.object({
  clientId: z.string().uuid(),
  formType: z.string().trim().min(2).max(20),
  taxYear: z.coerce.number().int().min(2000).max(2100),
  stage: z.string().trim().min(2).max(30),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin "New return" capture. Finds-or-creates the taxYear row for the given
 * client + year, and finds-or-creates a "tax_prep" engagement. Inserts the
 * returns row and 303-redirects to /dashboard/admin/returns.
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
    logEvent("return.create.validation_failed", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
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

    // Find or create the tax_year for this client + year
    let taxYearId: string;
    const ty = await getDb()
      .select({ id: taxYears.id })
      .from(taxYears)
      .where(and(eq(taxYears.clientId, payload.clientId), eq(taxYears.year, payload.taxYear)))
      .limit(1);
    if (ty.length > 0) {
      taxYearId = ty[0].id;
    } else {
      const due = new Date(`${payload.taxYear + 1}-04-15T00:00:00-05:00`);
      const [row] = await getDb()
        .insert(taxYears)
        .values({
          clientId: payload.clientId,
          year: payload.taxYear,
          filingStatus: "not_started",
          dueDate: due,
        })
        .returning({ id: taxYears.id });
      taxYearId = row!.id;
    }

    // Find the most recent tax_prep engagement for this client + year, or create one.
    let engagementId: string;
    const eg = await getDb()
      .select({ id: engagements.id })
      .from(engagements)
      .where(and(
        eq(engagements.clientId, payload.clientId),
        eq(engagements.serviceType, "tax_prep"),
        eq(engagements.status, "active"),
      ))
      .orderBy(sql`${engagements.createdAt} desc`)
      .limit(1);
    if (eg.length > 0) {
      engagementId = eg[0].id;
    } else {
      const [row] = await getDb()
        .insert(engagements)
        .values({
          clientId: payload.clientId,
          name: `${payload.taxYear} ${payload.formType}`,
          serviceType: "tax_prep",
          status: "active",
          ownerId: user.id,
          progressPercent: 0,
          internalNotes: payload.notes || null,
        })
        .returning({ id: engagements.id });
      engagementId = row!.id;
    }

    const [row] = await getDb()
      .insert(returns)
      .values({
        engagementId,
        taxYearId,
        formType: payload.formType,
        stage: payload.stage,
        assignedToId: user.id,
      })
      .returning({ id: returns.id });
    logEvent("return.create.success", { userId: user.id, returnId: row?.id, formType: payload.formType, taxYear: payload.taxYear });
  } catch (error) {
    logEvent("return.create.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  if (!contentType.includes("application/json")) {
    revalidatePath("/dashboard/admin/returns");
    return seeOther("/dashboard/admin/returns");
  }
  revalidatePath("/dashboard/admin/returns");
  return Response.json({ ok: true });
}
