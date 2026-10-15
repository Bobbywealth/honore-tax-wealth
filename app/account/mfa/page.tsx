import { redirect } from "next/navigation";
import DashboardShell from "../../dashboard/DashboardShell";
import { adminNav, agentNav } from "../../dashboard/admin/_lib/nav";
import { clientNav } from "../../dashboard/client/_lib/nav";
import { loadAdminNavCounts } from "../../dashboard/admin/lib/nav-counts";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import MfaSetup from "./MfaSetup";
import MfaDisable from "./MfaDisable";

export const dynamic = "force-dynamic";

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account/mfa");
  const params = await searchParams;
  const required = params.required === "1";

  let mfaEnabled = false;
  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const rows = await getDb()
        .select({ mfaEnabled: users.mfaEnabled })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      mfaEnabled = rows[0]?.mfaEnabled ?? false;
    }
  } catch {
    // best-effort
  }

  const counts = user.role === "client" ? { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 } : await loadAdminNavCounts();
  const nav =
    user.role === "client"
      ? clientNav(counts as { activeEngagements: number; openRequests: number; upcomingAppointments: number; unpaidInvoices: number })
      : user.role === "admin"
        ? adminNav(counts as Parameters<typeof adminNav>[0])
        : agentNav(counts as Parameters<typeof agentNav>[0]);
  const userLabel = user.displayName || user.email;

  return (
    <DashboardShell
      nav={nav}
      audience={user.role === "client" ? "Client" : "Admin"}
      title="Two-factor authentication"
      description="Protect your account with an authenticator app."
      currentHref="/account/mfa"
      userLabel={userLabel}
    >
      {required && !mfaEnabled ? (
        <div className="dashboard-alert" role="status">
          <p>
            <strong>Two-factor authentication is required for your account.</strong>{" "}
            Please complete enrollment below to continue working.
          </p>
        </div>
      ) : null}
      {mfaEnabled ? (
        <div className="dashboard-section">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">TWO-FACTOR AUTH</span>
            <h2>Two-factor is on</h2>
            <p className="dashboard-quiet">
              Your account requires an authenticator code on every sign-in.
              Keep your backup codes somewhere safe.
            </p>
          </div>
          <MfaDisable />
        </div>
      ) : (
        <MfaSetup />
      )}
    </DashboardShell>
  );
}
