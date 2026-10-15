import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import "./admin.css";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import { mfaRequiredForStaff } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Enforce the staff MFA requirement: when an admin turns it on, agents and
  // admins without MFA enrolled are sent to enrollment on every staff page
  // until they complete it.
  const user = await currentUser();
  if (user && user.role !== "client") {
    try {
      if (await mfaRequiredForStaff()) {
        if (process.env.DATABASE_URL) {
          await ensureMigrated();
          const rows = await getDb()
            .select({ mfaEnabled: users.mfaEnabled })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1);
          if (rows[0] && !rows[0].mfaEnabled) {
            redirect("/account/mfa?required=1");
          }
        }
      }
    } catch {
      // Best-effort: never break staff pages if the check fails.
    }
  }
  return <>{children}</>;
}
