import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { eq } from "drizzle-orm";

/**
 * Minimal key/value app settings store (admin-managed).
 * Best-effort: returns null when the DB is unreachable.
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    if (!process.env.DATABASE_URL) return null;
    await ensureMigrated();
    const rows = await getDb()
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureMigrated();
  await getDb()
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** "1" when admins require every agent/admin to enroll in MFA. */
export async function mfaRequiredForStaff(): Promise<boolean> {
  return (await getSetting("mfa_required_staff")) === "1";
}
