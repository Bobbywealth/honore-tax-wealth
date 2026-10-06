import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toggle a task between "open" and "done". Returns to /dashboard/admin/tasks.
 * Accepts POST with no body so a native form button on each task row works.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "staff");
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const current = rows[0].status;
    const next = current === "done" ? "open" : "done";
    const completedAt = next === "done" ? new Date() : null;
    await getDb()
      .update(tasks)
      .set({ status: next, completedAt, updatedAt: new Date() })
      .where(eq(tasks.id, id));
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "task.toggle", taskId: id, from: current, to: next, by: user.id }));
  } catch (error) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "task.toggle.db_error", taskId: id, err: (error as Error).message }));
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    revalidatePath("/dashboard/admin/tasks");
    return Response.redirect(new URL("/dashboard/admin/tasks", request.url), 303);
  }
  revalidatePath("/dashboard/admin/tasks");
  return Response.json({ ok: true });
}
