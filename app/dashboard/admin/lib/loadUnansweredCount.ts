import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";

/**
 * Count of "new" consultations waiting for the inbox. Returns 0 on
 * any error so the chrome never crashes on a DB hiccup.
 */
export async function loadUnansweredCount(): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const row = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(consultations)
      .where(sql`${consultations.status} = 'new'`)
      .limit(1);
    return row[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
