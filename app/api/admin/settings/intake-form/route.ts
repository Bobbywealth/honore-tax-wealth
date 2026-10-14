import { asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { intakeFormFields } from "@/db/schema";
import { ensureMigrated, seedIntakeFieldsIfEmpty } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the intake form field config. Seeds defaults on first call. */
export async function GET() {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, fields: [] });

  try {
    await ensureMigrated();
    await seedIntakeFieldsIfEmpty();
    const db = getDb();
    const rows = await db
      .select({
        id: intakeFormFields.id,
        fieldKey: intakeFormFields.fieldKey,
        label: intakeFormFields.label,
        fieldType: intakeFormFields.fieldType,
        required: intakeFormFields.required,
        sortOrder: intakeFormFields.sortOrder,
        isCustom: intakeFormFields.isCustom,
      })
      .from(intakeFormFields)
      .orderBy(asc(intakeFormFields.sortOrder));

    return Response.json({ ok: true, fields: rows });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}

const toggleSchema = z.object({
  fieldKey: z.string().min(1).max(80),
  required: z.boolean(),
});

/** PUT toggles a field's required flag (core fields only; custom fields use DELETE to remove). */
export async function PUT(request: Request) {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  let payload: z.infer<typeof toggleSchema>;
  try {
    payload = toggleSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const updated = await db
      .update(intakeFormFields)
      .set({ required: payload.required })
      .where(eq(intakeFormFields.fieldKey, payload.fieldKey))
      .returning({ id: intakeFormFields.id });
    if (updated.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}

const createSchema = z.object({
  label: z.string().min(1).max(160),
  fieldType: z.enum(["text", "email", "tel", "textarea", "select"]),
});

/** POST adds a custom field. */
export async function POST(request: Request) {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const fieldKey =
      "custom_" +
      payload.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
    const maxOrder = await db
      .select({ sortOrder: intakeFormFields.sortOrder })
      .from(intakeFormFields)
      .orderBy(asc(intakeFormFields.sortOrder));
    const nextOrder = (maxOrder.at(-1)?.sortOrder ?? 0) + 10;
    const [row] = await db
      .insert(intakeFormFields)
      .values({
        fieldKey,
        label: payload.label,
        fieldType: payload.fieldType,
        required: false,
        sortOrder: nextOrder,
        isCustom: true,
      })
      .returning({ id: intakeFormFields.id });
    return Response.json({ ok: true, id: row?.id });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}

/** DELETE removes a custom field (core fields cannot be deleted). */
export async function DELETE(request: Request) {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const fieldKey = searchParams.get("fieldKey");
  if (!fieldKey) return Response.json({ ok: false, error: "fieldKey_required" }, { status: 400 });

  try {
    await ensureMigrated();
    const db = getDb();
    const existing = await db
      .select({ id: intakeFormFields.id, isCustom: intakeFormFields.isCustom })
      .from(intakeFormFields)
      .where(eq(intakeFormFields.fieldKey, fieldKey))
      .limit(1);
    if (existing.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!existing[0]?.isCustom) {
      return Response.json({ ok: false, error: "cannot_delete_core_field" }, { status: 400 });
    }
    await db.delete(intakeFormFields).where(eq(intakeFormFields.fieldKey, fieldKey));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
