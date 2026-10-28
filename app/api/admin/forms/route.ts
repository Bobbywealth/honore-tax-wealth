import { z } from "zod";
import { getDb } from "@/db";
import { clients, signableDocuments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { TEMPLATES, type SignableKind } from "@/lib/signature-templates";
import { eq } from "drizzle-orm";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = Object.keys(TEMPLATES) as SignableKind[];

/** HTML forms submit every value as a string; treat "" as absent so optional numeric fields validate. */
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(KINDS as [SignableKind, ...SignableKind[]]),
  title: z.string().trim().min(2).max(200),
  formData: z.record(z.string(), z.string()).default({}),
  taxYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2000).max(2100).optional()),
  dueAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  requiredSigners: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(4).default(1)),
  bodyOverride: z.string().trim().max(20000).optional(),
});

/** Parse a year out of a template formData value (e.g. formData.tax_year). */
function parseTaxYear(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : undefined;
}

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
    const flat = raw as Record<string, unknown>;
    // The admin form posts pre-fill fields as dotted formData.KEY names;
    // nest them into the formData object the schema expects.
    const nested: Record<string, string> = {};
    for (const key of Object.keys(flat)) {
      if (!key.startsWith("formData.")) continue;
      const v = flat[key];
      delete flat[key];
      if (typeof v === "string" && v !== "") nested[key.slice("formData.".length)] = v;
    }
    const existing = flat.formData;
    flat.formData = {
      ...(typeof existing === "object" && existing !== null ? (existing as Record<string, string>) : {}),
      ...nested,
    };
    payload = schema.parse(flat);
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
    // Single tax-year field lives on the template (e.g. formData.tax_year);
    // fall back to it for the document's taxYear column when no explicit value was sent.
    const taxYear = payload.taxYear ?? parseTaxYear(payload.formData.tax_year);

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
        taxYear: taxYear ?? null,
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
    return seeOther(`/dashboard/admin/forms?created=${row?.id}`);
  } catch (error) {
    logEvent("forms.create.db_error", { actor: actor.id, err: String((error as Error).message) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
