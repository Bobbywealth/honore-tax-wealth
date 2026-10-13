import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardShell from "../DashboardShell";
import { adminNav } from "../admin/_lib/nav";
import { agentNav } from "../admin/_lib/nav";
import { loadAdminNavCounts } from "../admin/lib/nav-counts";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function dateOnly(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/profile");

  const counts = await loadAdminNavCounts();
  const nav = user.role === "admin" ? adminNav(counts) : agentNav(counts);

  return (
    <DashboardShell
      nav={nav}
      audience={user.role === "client" ? "Client" : "Admin"}
      title="Profile"
      description="Your account details. Edit display name, email, or phone in Settings."
      currentHref="/dashboard/profile"
      userLabel={user.displayName || user.email}
    >
      <section className="client-summary-side" style={{ maxWidth: 560 }}>
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">ACCOUNT</span>
          <h2>Your profile</h2>
          <p className="dashboard-quiet">
            Personal details are read-only here. Edit display name, email, or phone in
            {user.role === "admin" ? " Settings → Profile." : " your account page (coming soon)."}
          </p>
        </div>
        <dl className="client-summary-dl">
          <div>
            <dt>Display name</dt>
            <dd>{user.displayName || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div>
            <dt>Signed in</dt>
            <dd>{dateOnly(new Date())}</dd>
          </div>
        </dl>
        <h3 style={{ marginTop: 22, font: "700 12px Manrope", letterSpacing: ".06em", textTransform: "uppercase", color: "#5b6c78" }}>
          Quick actions
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <Link href="/account/change-password" className="dashboard-button">
            Change password
          </Link>
          {user.role === "admin" ? (
            <Link href="/dashboard/admin/settings" className="dashboard-button dashboard-button-secondary">
              Edit display name, email, phone
            </Link>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="dashboard-button dashboard-button-secondary">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </DashboardShell>
  );
}
