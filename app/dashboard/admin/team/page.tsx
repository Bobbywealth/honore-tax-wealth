import { Mail } from "lucide-react";
import { asc, eq, inArray, isNull, sql } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { engagements, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

function initials(name: string, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: Date | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(
    new Date(value),
  );
}

/**
 * Real accounts only.
 *
 * The previous version listed six invented staff members with roles and
 * working-looking email addresses on the practice's own domain — a "Senior
 * Preparer" at sharon@honore-tax.com, an "Admin Assistant" at
 * marcus@honore-tax.com — along with invented return counts and weekly hours.
 *
 * Inventing team members is exactly what the brief forbids, and worse than
 * decorative placeholder data: anyone emailing those addresses would expect a
 * real person to answer. The list now contains only accounts that exist in the
 * users table.
 */
export default async function TeamPage() {
  const access = await checkAdminAccess();
  if (!access.allowed) return access.restricted;

  const nav = adminNav(await loadAdminNavCounts());

  let rows: Array<{
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    ownedEngagements: number;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    const accounts = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(inArray(users.role, ["admin", "staff"]))
      .orderBy(asc(users.displayName));

    // Real workload: engagements each account owns. Never invented hours.
    const ids = accounts.map((a) => a.id);
    let owned = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await db
        .select({ ownerId: engagements.ownerId, n: sql<number>`count(*)::int` })
        .from(engagements)
        .where(inArray(engagements.ownerId, ids))
        .groupBy(engagements.ownerId);
      for (const c of counts) if (c.ownerId) owned.set(c.ownerId, Number(c.n));
    }

    rows = accounts.map((a) => ({ ...a, ownedEngagements: owned.get(a.id) ?? 0 }));
  } catch {
    unavailable = true;
  }

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/team" audience="Admin" title="Team" description="Staff members and their roles.">
      <div className="adm-page-h">
        <div>
          <h1>Team</h1>
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `${rows.length} staff ${rows.length === 1 ? "account" : "accounts"} · ${rows.filter((r) => !r.emailVerifiedAt).length} unverified`}
          </div>
        </div>
        <span className="adm-badge">
          <a className="adm-badge adm-badge-link" href="/dashboard/admin/settings#team" title="Open team settings to enable invitations"><Mail size={13} aria-hidden="true" /> Invitations are not enabled</a>
        </span>
      </div>

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load the team list. Nothing has been lost — try again shortly.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <h2>No staff accounts yet</h2>
          <p>
            The first administrator is created on first sign-in from the ADMIN_EMAIL and
            ADMIN_PASSWORD environment variables. Additional staff accounts can be created from the
            database until invitations are wired up.
          </p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="sr-only">Staff accounts with portal access</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Email verified</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Engagements owned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="adm-client-cell">
                      <span className="av">{initials(r.displayName ?? "", r.email)}</span>
                      <div>
                        <strong>{r.displayName ?? "Unnamed account"}</strong>
                      </div>
                    </div>
                  </td>
                  <td>
                    <a href={`mailto:${r.email}`} className="adm-card-sub">
                      {r.email}
                    </a>
                  </td>
                  <td>
                    <span className="adm-badge">{r.role}</span>
                  </td>
                  <td>
                    {r.emailVerifiedAt ? (
                      <span className="adm-badge">Verified</span>
                    ) : (
                      <span className="adm-badge">Not verified</span>
                    )}
                  </td>
                  <td>
                    <time dateTime={r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : undefined}>
                      {formatDate(r.lastLoginAt)}
                    </time>
                  </td>
                  <td>{r.ownedEngagements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}