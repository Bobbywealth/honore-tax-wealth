import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  // Omit to mark all as read.
  ids: z.array(z.string().uuid()).max(50).optional(),
});

/** Mark in-app notifications as read. Only the caller's own. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let payload: z.infer<typeof schema> = {};
  try {
    payload = schema.parse(await request.json().catch(() => ({})));
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const where = payload.ids?.length
      ? and(
          eq(notifications.userId, user.id),
          eq(notifications.channel, "inapp"),
          inArray(notifications.id, payload.ids),
        )
      : and(eq(notifications.userId, user.id), eq(notifications.channel, "inapp"));

    await db
      .update(notifications)
      .set({ status: "read" })
      .where(where);

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
