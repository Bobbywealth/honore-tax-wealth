import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

const schema = z.object({
  title: z.string().trim().min(1, "title").max(240, "title"),
  description: z.string().trim().max(2000, "description").optional().default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  dueAt: z.string().trim().max(40).optional().default(""),
  assignedToId: z
    .string()
    .trim()
    .regex(/^[0-9a-f-]{36}$/i, "assignedToId")
    .optional()
    .or(z.literal("")),
});

/**
 * Create a task. Staff and admins only.
 * Accepts a native form POST (redirects back to /dashboard/admin/tasks) or
 * JSON (returns { ok: true, id }).
 */
export async function POST(request: Request) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let input: unknown;
  try {
    input = contentType.includes("application/json")
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(input);
  } catch {
    const back = "/dashboard/admin/tasks?new=1&error=invalid";
    if (!contentType.includes("application/json")) {
      return seeOther(back);
    }
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  let due: Date | null = null;
  if (parsed.dueAt) {
    const d = new Date(parsed.dueAt);
    if (!Number.isNaN(d.getTime())) due = d;
  }

  try {
    await ensureMigrated();
    const inserted = await getDb()
      .insert(tasks)
      .values({
        title: parsed.title,
        description: parsed.description || null,
        status: "open",
        priority: parsed.priority,
        assignedToId: parsed.assignedToId || null,
        createdById: user.id,
        dueAt: due,
      })
      .returning({ id: tasks.id });
    const id = inserted[0]?.id ?? null;
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), event: "task.created", taskId: id, by: user.id }),
    );
    revalidatePath("/dashboard/admin/tasks");
    if (!contentType.includes("application/json")) {
      return seeOther("/dashboard/admin/tasks?created=1");
    }
    return Response.json({ ok: true, id });
  } catch (error) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "task.create.db_error",
        err: (error as Error).message,
      }),
    );
    if (!contentType.includes("application/json")) {
      return seeOther("/dashboard/admin/tasks?new=1&error=db");
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
