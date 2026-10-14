import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { emailTemplates } from "@/db/schema";
import { ensureMigrated, seedEmailTemplatesIfEmpty } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the email template list. Seeds defaults on first call. */
export async function GET() {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, templates: [] });

  try {
    await ensureMigrated();
    await seedEmailTemplatesIfEmpty();
    const db = getDb();
    const rows = await db
      .select({
        id: emailTemplates.id,
        key: emailTemplates.key,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        body: emailTemplates.body,
      })
      .from(emailTemplates)
      .orderBy(asc(emailTemplates.name));

    return Response.json({ ok: true, templates: rows });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}

const updateSchema = z.object({
  key: z.string().min(1).max(80),
  subject: z.string().min(1).max(240),
  body: z.string().min(1).max(20000),
});

/** PUT updates a template's subject/body by key. */
export async function PUT(request: Request) {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const updated = await db
      .update(emailTemplates)
      .set({ subject: payload.subject, body: payload.body, updatedAt: new Date() })
      .where(eq(emailTemplates.key, payload.key))
      .returning({ id: emailTemplates.id });
    if (updated.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
