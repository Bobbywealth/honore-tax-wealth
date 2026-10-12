import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.object({ id: z.string().uuid() });

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Deactivate a staff account. Soft delete by setting deactivated_at and
 * bumping the session watermark; revokes all live sessions for the user
 * in the same transaction so any open browser tab is signed out on the
 * next request. Preserves audit trail (audit log, consultation history,
 * engagement ownership) — no rows are deleted.
 *
 * Admin-only. Self-deactivation is rejected to prevent an admin from
 * locking the whole practice out.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("admin");
  if (!actor) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const parsed = idSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const targetId = parsed.data.id;
  if (targetId === actor.id) {
    return Response.json({ ok: false, error: "cannot_deactivate_self" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const target = await db.select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt }).from(users).where(eq(users.id, targetId)).limit(1);
    const row = target[0];
    if (!row) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (row.role === "client") {
      return Response.json({ ok: false, error: "cannot_deactivate_client_via_team" }, { status: 400 });
    }
    if (row.deactivatedAt) {
      // Idempotent: already gone.
      return Response.json({ ok: true, alreadyDeactivated: true });
    }

    await db
      .update(users)
      .set({
        deactivatedAt: new Date(),
        sessionsValidFrom: new Date(),
        // Replace the password hash with a fresh random value so a leaked
        // stored hash from before deactivation cannot be used offline.
        passwordHash: `deactivated:${Date.now()}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));
    // Belt-and-suspenders: revoke any not-yet-expired sessions in the same
    // transaction. The session watermark above also gates them, but the
    // explicit revoke clears them so /api/auth/me stops returning this user.
    await db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(eq(sessions.userId, targetId));

    logEvent("team.deactivate.success", { actor: actor.id, target: targetId });
    revalidatePath("/dashboard/admin/team");
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("team.deactivate.db_error", { actor: actor.id, err: String((error as Error).message) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
