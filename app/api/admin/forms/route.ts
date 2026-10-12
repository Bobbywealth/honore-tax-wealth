import { z } from "zod";
import { getDb } from "@/db";
import { clients, signableDocuments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { TEMPLATES, type SignableKind } from "@/lib/signature-templates";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = Object.keys(TEMPLATES) as SignableKind[];

const schema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(KINDS as [SignableKind, ...SignableKind[]]),
  title: z.string().trim().min(2).max(200),
  formData: z.record(z.string(), z.string()).default({}),
  taxYear: z.number().int().min(2000).max(2100).optional(),
  dueAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  requiredSigners: z.number().int().min(1).max(4).default(1),
  bodyOverride: z.string().trim().max(20000).optional(),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin creates a signable document for a client. The form body and
 * pre-filled fields are derived from the chosen template kind; the
 * admin can override the body inline (for disclosure-style forms).
 */
export async function POST(request: Request) {
  const actor = await requireRole("admin", "staff", "assistant");
  if (!actor) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 16_000) {
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
    logEvent("forms.create.validation_failed", { actor: actor.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const template = TEMPLATES[payload.kind];
  if (!template) {
    return Response.json({ ok: false, error: "unknown_template_kind" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const [client] = await db
      .select({ id: clients.id, displayName: clients.displayName })
      .from(clients)
      .where(eq(clients.id, payload.clientId))
      .limit(1);
    if (!client) return Response.json({ ok: false, error: "client_not_found" }, { status: 404 });

    // Build body from template (allow admin override for body)
    const body = payload.bodyOverride ?? template.bodyTemplate(payload.formData, client.displayName);

    const [row] = await db
      .insert(signableDocuments)
      .values({
        clientId: payload.clientId,
        preparedById: actor.id,
        kind: payload.kind,
        title: payload.title,
        body,
        formData: payload.formData,
        requiredSigners: payload.requiredSigners,
        taxYear: payload.taxYear ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        status: "pending",
      })
      .returning({ id: signableDocuments.id });

    logEvent("forms.create.success", { actor: actor.id, formId: row?.id, clientId: payload.clientId, kind: payload.kind });

    revalidatePath("/dashboard/admin/forms");
    revalidatePath(`/dashboard/admin/clients/${payload.clientId}`);
    revalidatePath("/dashboard/client");

    const wantsJson = (request.headers.get("accept") ?? "").includes("application/json") || contentType.includes("application/json");
    if (wantsJson) return Response.json({ ok: true, id: row?.id });
    return Response.redirect(
      new URL(`/dashboard/admin/forms?created=${row?.id}`, request.url),
      303,
    );
  } catch (error) {
    logEvent("forms.create.db_error", { actor: actor.id, err: String((error as Error).message) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
