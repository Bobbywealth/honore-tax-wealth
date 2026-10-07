import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { consultations, conversations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

/**
 * Quick sidebar counts: unanswered consultation requests + staff-unread
 * conversations. Used by every AdminShell-using page to render live badges.
 */
export async function loadAdminNavCounts(): Promise<{ unanswered: number; conversationsUnread: number }> {
  if (!process.env.DATABASE_URL) return { unanswered: 0, conversationsUnread: 0 };
  try {
    await ensureMigrated();
    const db = getDb();
    const [u, c] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(consultations).where(sql`${consultations.status} = 'new'`),
      db.select({ c: sql<number>`coalesce(sum(${conversations.staffUnreadCount}), 0)::int` }).from(conversations),
    ]);
    return { unanswered: u[0]?.c ?? 0, conversationsUnread: Number(c[0]?.c ?? 0) };
  } catch {
    return { unanswered: 0, conversationsUnread: 0 };
  }
}
