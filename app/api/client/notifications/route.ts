import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { TEMPLATE_LABEL, templateBody, type NotifyTemplate } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the caller's in-app notifications, newest first. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    await ensureMigrated();
    const rows = await getDb()
      .select({
        id: notifications.id,
        template: notifications.template,
        payload: notifications.payload,
        status: notifications.status,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.channel, "inapp")))
      .orderBy(desc(notifications.createdAt))
      .limit(30);

    return Response.json({
      ok: true,
      notifications: rows.map((r) => ({
        id: r.id,
        title: TEMPLATE_LABEL[r.template as NotifyTemplate] ?? "Notification",
        body: templateBody(r.template as NotifyTemplate, r.payload ?? {}),
        read: r.status === "read",
        createdAt: r.createdAt,
      })),
      unread: rows.filter((r) => r.status !== "read").length,
    });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
