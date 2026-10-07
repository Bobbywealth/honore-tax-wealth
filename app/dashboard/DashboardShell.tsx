import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, LayoutDashboard, type LucideIcon } from "lucide-react";

export type PortalNavItem = {
  href: string;
  label: string;
  icon?: LucideIcon | ReactNode;
  badge?: { value: number; tone?: "default" | "red" | "amber" };
};

type Props = {
  audience: "Client" | "Admin";
  title: string;
  description: string;
  children: ReactNode;
  nav: PortalNavItem[];
  /** Display name of the signed-in account, shown in the topbar. */
  userLabel?: string | null;
  currentHref?: string;
};

/**
 * Chrome for the signed-in portals.
 *
 * Multi-page sidebar navigation: each link points at its own /dashboard/...
 * route, not an in-page anchor. The `currentHref` prop is what the shell uses
 * to mark the active item.
 */
export default function DashboardShell({
  audience,
  title,
  description,
  children,
  nav,
  userLabel,
  currentHref,
}: Props) {
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-logo" href="/">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </Link>
        <div className="dashboard-side-label">{audience} portal</div>
        <nav aria-label="Dashboard navigation">
          {nav.map((item) => {
            const Icon = item.icon ?? (item.href === "/dashboard/client" || item.href === "/dashboard/admin" ? LayoutDashboard : null);
            const active = currentHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {Icon ? <span className="dashboard-nav-icon">{typeof Icon === "function" ? <Icon size={20} aria-hidden="true" /> : Icon}</span> : null}
                <span className="dashboard-nav-label">{item.label}</span>
                {item.badge ? (
                  <span className={`dashboard-nav-badge${item.badge.tone === "red" ? " is-red" : item.badge.tone === "amber" ? " is-amber" : ""}`}>
                    {item.badge.value}
                  </span>
                ) : null}
              </Link>
            );
          })}
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

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <Link className="dashboard-mobile-logo" href="/">
            <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
          </Link>
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