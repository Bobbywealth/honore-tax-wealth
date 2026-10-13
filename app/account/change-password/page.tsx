import { redirect } from "next/navigation";
import DashboardShell from "../../dashboard/DashboardShell";
import { adminNav, agentNav } from "../../dashboard/admin/_lib/nav";
import { loadAdminNavCounts } from "../../dashboard/admin/lib/nav-counts";
import { currentUser } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account/change-password");

  const counts = await loadAdminNavCounts();
  const nav = user.role === "admin" ? adminNav(counts) : agentNav(counts);
  const userLabel = user.displayName || user.email;

  return (
    <DashboardShell
      nav={nav}
      audience={user.role === "client" ? "Client" : "Admin"}
      title="Change password"
      description="Updates your account password and signs out other devices."
      currentHref="/account/change-password"
      userLabel={userLabel}
    >
      <div className="dashboard-section-head">
        <span className="dashboard-eyebrow">ACCOUNT</span>
        <h2>Change password</h2>
        <p className="dashboard-quiet">
          Pick a password at least 12 characters long with a mix of letters, numbers, and symbols. We sign out every other device to keep your account safe.
        </p>
      </div>
      <ChangePasswordForm userLabel={userLabel} role={user.role} />
    </DashboardShell>
  );
}
