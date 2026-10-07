"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, LayoutDashboard, Menu, X, type LucideIcon } from "lucide-react";

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
  userLabel?: string | null;
  currentHref?: string;
};

/**
 * Chrome for the signed-in portals. Multi-page sidebar; on small screens it
 * collapses behind a hamburger menu and slides over the content.
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="dashboard">
      {menuOpen ? (
        <div className="dashboard-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      ) : null}
      <aside className={`dashboard-sidebar${menuOpen ? " is-open" : ""}`}>
        <Link className="dashboard-logo" href="/">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </Link>
        <div className="dashboard-side-label">{audience} portal</div>
        <nav aria-label="Dashboard navigation">
          {nav.map((item) => {
            const Icon =
              item.icon ??
              (item.href === "/dashboard/client" || item.href === "/dashboard/admin"
                ? LayoutDashboard
                : null);
            const active = currentHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {Icon ? (
                  <span className="dashboard-nav-icon">
                    {React.isValidElement(Icon) ? Icon : React.createElement(Icon as React.ElementType, { size: 20, "aria-hidden": true })}
                  </span>
                ) : null}
                <span className="dashboard-nav-label">{item.label}</span>
                {item.badge ? (
                  <span
                    className={`dashboard-nav-badge${item.badge.tone === "red" ? " is-red" : item.badge.tone === "amber" ? " is-amber" : ""}`}
                  >
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
          <button
            type="button"
            className="dashboard-mobile-menu-toggle"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
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
