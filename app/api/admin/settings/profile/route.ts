import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole, normalizeEmail, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().max(30).optional(),
  // Practice-level settings (stored in a small JSON on the user record or
  // a separate table — for now we accept them but only persist what's in
  // the users schema).
  practiceLegalName: z.string().trim().min(2).max(160).optional(),
  practiceAddress: z.string().trim().max(240).optional(),
  acceptNewClients: z.string().optional(),
  taxSeasonSurcharge: z.string().optional(),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export async function POST(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  let payload: z.infer<typeof schema>;
  try {
    const raw = await request.json();
    payload = schema.parse(raw);
  } catch (error) {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (payload.displayName !== undefined) updates.displayName = payload.displayName;
  if (payload.email !== undefined) updates.email = normalizeEmail(payload.email);
  if (payload.phone !== undefined) updates.phone = payload.phone || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ ok: true, note: "no_personal_fields_changed" });
  }

  try {
    await ensureMigrated();
    await getDb().update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, user.id));
    logEvent("settings.profile.updated", { userId: user.id, fields: Object.keys(updates) });
    revalidatePath("/dashboard/admin/settings");
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("settings.profile.db_error", { userId: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
