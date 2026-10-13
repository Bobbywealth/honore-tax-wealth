"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft, LogOut, LayoutDashboard, Mail, MessageSquareText,
  Users as UsersIcon, FileText, Receipt, ClipboardList, CalendarDays,
  UserPlus as UserPlusIcon, BarChart3, Contact, Settings, Menu, X, type LucideIcon,
} from "lucide-react";
import CommandPalette from "./admin/_components/CommandPalette";
import ConsultationDialog from "@/components/ConsultationDialog";


export type NavIconKey =
  | "dashboard" | "inbox" | "messages" | "clients" | "returns"
  | "documents" | "tasks" | "calendar" | "leads" | "reports"
  | "team" | "settings" | "overview" | "tax-work"
  | "invoices" | "appointments" | "client" | "clipboard";

export type PortalNavItem = {
  href: string;
  label: string;
  icon?: NavIconKey | ReactNode;
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
function renderNavIcon(key: NavIconKey): ReactNode {
  const Icon = NAV_ICONS[key];
  return Icon ? <Icon size={20} aria-hidden="true" /> : null;
}

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Mail,
  messages: MessageSquareText,
  clients: UsersIcon,
  returns: ClipboardList,
  documents: FileText,
  tasks: Receipt,
  calendar: CalendarDays,
  leads: UserPlusIcon,
  reports: BarChart3,
  team: Contact,
  settings: Settings,
  overview: LayoutDashboard,
  "tax-work": ClipboardList,
  invoices: Receipt,
  appointments: CalendarDays,
  client: UsersIcon,
  clipboard: ClipboardList,
};

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
      <CommandPalette />
      <aside className={`dashboard-sidebar${menuOpen ? " is-open" : ""}`}>
        <Link className="dashboard-logo" href="/">
          <img src="/assets/honore-logo-cropped.png" alt="Honore Tax & Wealth" />
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
                    {typeof Icon === "string" ? renderNavIcon(Icon as NavIconKey) : React.isValidElement(Icon) ? Icon : null}
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
            <img src="/assets/honore-logo-cropped.png" alt="Honore Tax & Wealth" />
          </Link>
          <span>{audience} dashboard</span>
          {userLabel ? (
            <details className="dashboard-account" aria-label="Account menu">
              <summary>
                <span>{userLabel}</span>
              </summary>
              <div className="dashboard-account-menu" role="menu">
                <a href="/dashboard/profile" role="menuitem">Profile</a>
                <a href="/account/change-password" role="menuitem">Change password</a>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="danger" role="menuitem">Sign out</button>
                </form>
              </div>
            </details>
          ) : null}
        </header>
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <div>
              <span className="dashboard-eyebrow">HONORE / {audience.toUpperCase()}</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      {/* Consultation request dialog for the [data-open-consultation] buttons
          used across the portals. Rendered here so public/consultation.js can
          find #consultation-dialog on dashboard pages. */}
      <ConsultationDialog />
    </div>
  );
}
