import type { ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, LogOut } from "lucide-react";

export type PortalNavItem = { href: string; label: string };

type Props = {
  audience: "Client" | "Admin";
  title: string;
  description: string;
  children: ReactNode;
  nav?: PortalNavItem[];
  /** Display name of the signed-in account, shown in the topbar. */
  userLabel?: string | null;
};

const defaultNav: PortalNavItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#activity", label: "Activity" },
  { href: "#next-steps", label: "Next steps" },
];

/**
 * Chrome for the signed-in portals.
 *
 * The previous version stamped a "PORTAL PREVIEW" badge and an "Exit preview"
 * link on every page, which claimed these screens were not real. They are now
 * backed by authorized database reads, so that badge would be false. Sign-out
 * posts to the API, which deletes the session row server-side rather than
 * only clearing the cookie in the browser.
 */
export default function DashboardShell({
  audience,
  title,
  description,
  children,
  nav = defaultNav,
  userLabel,
}: Props) {
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <a className="dashboard-logo" href="/">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </a>
        <div className="dashboard-side-label">{audience} portal</div>
        <nav aria-label="Dashboard navigation">
          {nav.map((item, i) => (
            <a key={item.href} href={item.href} className={i === 0 ? "is-active" : undefined}>
              {i === 0 ? <LayoutDashboard size={18} aria-hidden="true" /> : null}
              {item.label}
            </a>
          ))}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <a href="/"><ArrowLeft size={16} aria-hidden="true" /> Website</a>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="dashboard-signout">
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="dashboard-main" id="overview">
        <header className="dashboard-topbar">
          <a className="dashboard-mobile-logo" href="/">
            <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
          </a>
          <span>{audience} dashboard</span>
          {userLabel ? <span className="dashboard-user">{userLabel}</span> : null}
        </header>
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <div>
              <span className="dashboard-eyebrow">HONORÉ / {audience.toUpperCase()}</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}