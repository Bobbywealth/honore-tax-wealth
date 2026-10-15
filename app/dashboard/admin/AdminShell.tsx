import type { ReactNode } from "react";
import { BarChart3, Calendar, CheckSquare, FileText, Globe, Home, Inbox, LayoutDashboard, LogOut, MessageSquareText, Settings, UserPlus, Users } from "lucide-react";
import { currentUser } from "@/lib/auth";

type NavItem = { label: string; href: string; icon: ReactNode; badge?: { value: number; tone?: "default" | "red" } };

const ADMIN_WORK_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Inbox", href: "/dashboard/admin/inbox", icon: <Inbox size={18} /> },
  { label: "Messages", href: "/dashboard/admin/messages", icon: <MessageSquareText size={18} /> },
  { label: "Clients", href: "/dashboard/admin/clients", icon: <Users size={18} /> },
  { label: "Returns", href: "/dashboard/admin/returns", icon: <FileText size={18} /> },
  { label: "Documents", href: "/dashboard/admin/documents", icon: <FileText size={18} /> },
  { label: "Tasks", href: "/dashboard/admin/tasks", icon: <CheckSquare size={18} /> },
];

const ADMIN_PRACTICE: NavItem[] = [
  { label: "Calendar", href: "/dashboard/admin/calendar", icon: <Calendar size={18} /> },
  { label: "Leads", href: "/dashboard/admin/leads", icon: <UserPlus size={18} /> },
  { label: "Reports", href: "/dashboard/admin/reports", icon: <BarChart3 size={18} /> },
];

const ADMIN_ADMIN: NavItem[] = [
  { label: "Team", href: "/dashboard/admin/team", icon: <Users size={18} /> },
  { label: "Settings", href: "/dashboard/admin/settings", icon: <Settings size={18} /> },
];

const AGENT_WORK_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Clients", href: "/dashboard/admin/clients", icon: <Users size={18} /> },
  { label: "Returns", href: "/dashboard/admin/returns", icon: <FileText size={18} /> },
  { label: "Documents", href: "/dashboard/admin/documents", icon: <FileText size={18} /> },
  { label: "Tasks", href: "/dashboard/admin/tasks", icon: <CheckSquare size={18} /> },
];

const AGENT_PRACTICE: NavItem[] = [
  { label: "Calendar", href: "/dashboard/admin/calendar", icon: <Calendar size={18} /> },
];

const AGENT_ADMIN: NavItem[] = [
  { label: "Settings", href: "/dashboard/admin/settings", icon: <Settings size={18} /> },
];

function Group({ label, items, currentHref, badges }: { label: string; items: NavItem[]; currentHref: string; badges?: Record<string, number> }) {
  return (
    <>
      <div className="adm-grp">{label}</div>
      {items.map((item) => {
        const active = currentHref === item.href;
        const live = badges?.[item.label.toLowerCase()];
        const badgeValue = typeof live === "number" ? live : item.badge?.value;
        return (
          <a key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={`adm-it${active ? " is-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
            {badgeValue ? <span className={`adm-badge${item.badge?.tone === "red" ? " red" : ""}`}>{badgeValue}</span> : null}
          </a>
        );
      })}
    </>
  );
}

type Props = {
  preview: boolean;
  currentHref?: string;
  unanswered?: number;
  conversationsUnread?: number;
  children: ReactNode;
};

export default async function AdminShell({
  preview,
  currentHref = "/dashboard/admin",
  unanswered = 0,
  conversationsUnread = 0,
  children,
}: Props) {
  const user = await currentUser();
  const isAdmin = user?.role === "admin";
  const badges: Record<string, number> = { inbox: unanswered, messages: conversationsUnread };

  return (
    <div className="adm-root">
      <aside className="adm-sb">
        <div className="adm-brand">
          <a href="/" className="adm-brand-plate" aria-label="I Honore Tax & Wealth home">
            <img src="/assets/honore-logo-cropped.png" alt="I Honore Tax & Wealth" />
          </a>
        </div>

        <Group label="Work" items={isAdmin ? ADMIN_WORK_NAV : AGENT_WORK_NAV} currentHref={currentHref} badges={badges} />
        <Group label="Practice" items={isAdmin ? ADMIN_PRACTICE : AGENT_PRACTICE} currentHref={currentHref} />
        <Group label="Admin" items={isAdmin ? ADMIN_ADMIN : AGENT_ADMIN} currentHref={currentHref} />

        <div className="adm-me">
          <div className="adm-me-row">
            <div className="adm-av">{(user?.displayName || user?.email || "?").slice(0, 2).toUpperCase()}</div>
            <div className="adm-me-info">
              <b>{user?.displayName || user?.email || "Sign in"}</b>
              <div className="adm-sm">{user?.role === "admin" ? "Owner" : user?.role === "staff" ? "Staff" : user?.role === "assistant" ? "Assistant" : user?.role === "client" ? "Client" : "Signed in"}</div>
            </div>
          </div>
          <form className="adm-logout-form" action="/api/auth/logout" method="post">
            <button type="submit" className="adm-logout" aria-label="Sign out" title="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </form>
          <div className="adm-foot">
            <a href="/dashboard"><Home size={13} /> Portal home</a>
            <a href="/"><Globe size={13} /> Website</a>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <div className="adm-crumb">
            <span>I Honore</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            <b>Admin</b>
          </div>
          <div className="adm-sp" />
          <form className="adm-search" action="/dashboard/admin/inbox" method="get" role="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input type="search" name="q" placeholder="Search clients, returns, documents…" aria-label="Search" />
            <kbd>⌘K</kbd>
          </form>
          <div className="adm-sp" />
          <a href="/dashboard/admin/inbox" className="adm-bell adm-bell-link" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14V9a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
              <path d="M9 19a3 3 0 0 0 6 0" />
            </svg>
            {unanswered > 0 ? <span className="adm-bell-dot" aria-hidden="true">{unanswered}</span> : null}
          </a>
          {isAdmin ? (
            <details className="adm-new">
              <summary className="adm-btn adm-new-trigger" aria-label="Create new">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>New</span>
                <svg className="adm-new-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <div className="adm-new-menu" role="menu">
                <a href="/dashboard/admin/leads?new=1" role="menuitem">
                  <span className="adm-new-ico" style={{ background: "#d4a755" }}>L</span>
                  <span><b>New lead</b><small>Capture a prospect</small></span>
                </a>
                <a href="/dashboard/admin/clients?new=1" role="menuitem">
                  <span className="adm-new-ico" style={{ background: "#2a5d8f" }}>C</span>
                  <span><b>New client</b><small>Onboard from a lead</small></span>
                </a>
                <a href="/dashboard/admin/tasks?new=1" role="menuitem">
                  <span className="adm-new-ico" style={{ background: "#7a5ca8" }}>T</span>
                  <span><b>New task</b><small>For me or the team</small></span>
                </a>
                <a href="/dashboard/admin/calendar?new=1" role="menuitem">
                  <span className="adm-new-ico" style={{ background: "#2f8a5b" }}>A</span>
                  <span><b>New appointment</b><small>Block time on the calendar</small></span>
                </a>
              </div>
            </details>
          ) : null}
        </header>

        <details className="adm-mobile-nav"><summary>Navigate your workspace</summary><nav aria-label="Mobile admin navigation">{[...(isAdmin ? ADMIN_WORK_NAV : AGENT_WORK_NAV),...(isAdmin ? ADMIN_PRACTICE : AGENT_PRACTICE),...(isAdmin ? ADMIN_ADMIN : AGENT_ADMIN)].map(item=><a key={item.href} href={item.href} aria-current={currentHref===item.href?"page":undefined}>{item.label}</a>)}</nav></details>
        <div className="adm-c">
          {preview ? (
            <div style={{ marginBottom: 14, padding: "8px 14px", background: "#efe3cb", color: "#7b5c31", borderRadius: 8, font: "800 10px Manrope, sans-serif", letterSpacing: ".12em", textTransform: "uppercase", display: "inline-block" }}>
              Portal preview · Live data is gated
            </div>
          ) : null}
          <div className="adm-sample-note" role="note"><strong>Workspace design preview.</strong> Pipeline, revenue, calendar, and activity examples are illustrative. Only consultation records loaded from the database represent actual requests.</div>
          {children}
        </div>
      </main>
    </div>
  );
}
