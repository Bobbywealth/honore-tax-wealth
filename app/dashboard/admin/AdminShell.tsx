import type { ReactNode } from "react";
import { BarChart3, Calendar, CheckSquare, FileText, Globe, Home, Inbox, LayoutDashboard, LogOut, Settings, UserPlus, Users } from "lucide-react";
import Link from "next/link";

type NavItem = { label: string; href: string; icon: ReactNode; badge?: { value: number; tone?: "default" | "red" } };

const WORK: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Inbox", href: "/dashboard/admin/inbox", icon: <Inbox size={18} />, badge: { value: 3 } },
  { label: "Clients", href: "/dashboard/admin/clients", icon: <Users size={18} /> },
  { label: "Returns", href: "/dashboard/admin/returns", icon: <FileText size={18} />, badge: { value: 2, tone: "red" } },
  { label: "Documents", href: "/dashboard/admin/documents", icon: <FileText size={18} />, badge: { value: 7 } },
  { label: "Tasks", href: "/dashboard/admin/tasks", icon: <CheckSquare size={18} />, badge: { value: 5 } },
];

const PRACTICE: NavItem[] = [
  { label: "Calendar", href: "/dashboard/admin/calendar", icon: <Calendar size={18} /> },
  { label: "Leads", href: "/dashboard/admin/leads", icon: <UserPlus size={18} /> },
  { label: "Reports", href: "/dashboard/admin/reports", icon: <BarChart3 size={18} /> },
];

const ADMIN: NavItem[] = [
  { label: "Team", href: "/dashboard/admin/team", icon: <Users size={18} /> },
  { label: "Settings", href: "/dashboard/admin/settings", icon: <Settings size={18} /> },
];

function Group({ label, items, currentHref }: { label: string; items: NavItem[]; currentHref: string }) {
  return (
    <>
      <div className="adm-grp">{label}</div>
      {items.map((item) => {
        const active = currentHref === item.href;
        return (
          <Link key={item.label} href={item.href} className={`adm-it${active ? " is-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
            {item.badge ? <span className={`adm-badge${item.badge.tone === "red" ? " red" : ""}`}>{item.badge.value}</span> : null}
          </Link>
        );
      })}
    </>
  );
}

type Props = {
  preview: boolean;
  currentHref?: string;
  children: ReactNode;
};

export default function AdminShell({ preview, currentHref = "/dashboard/admin", children }: Props) {
  return (
    <div className="adm-root">
      <aside className="adm-sb">
        <div className="adm-brand">
          <Link href="/" className="adm-brand-plate" aria-label="Honoré Tax & Wealth home">
            <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
          </Link>
        </div>

        <Group label="Work" items={WORK} currentHref={currentHref} />
        <Group label="Practice" items={PRACTICE} currentHref={currentHref} />
        <Group label="Admin" items={ADMIN} currentHref={currentHref} />

        <div className="adm-me">
          <button type="button" className="adm-logout" aria-label="Sign out" title="Sign out">
            <LogOut size={14} />
          </button>
          <div className="adm-me-row">
            <div className="adm-av">BW</div>
            <div>
              <b>Bobby Wealth</b>
              <div className="adm-sm">Owner · 28 min</div>
            </div>
          </div>
          <div className="adm-foot">
            <Link href="/dashboard"><Home size={13} /> Portal home</Link>
            <Link href="/"><Globe size={13} /> Website</Link>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <div className="adm-crumb">
            <span>Honoré</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            <b>Admin</b>
          </div>
          <div className="adm-sp" />
          <div className="adm-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input type="text" placeholder="Search clients, returns, documents…" aria-label="Search" />
            <kbd>⌘K</kbd>
          </div>
          <div className="adm-sp" />
          <button type="button" className="adm-bell" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14V9a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
              <path d="M9 19a3 3 0 0 0 6 0" />
            </svg>
          </button>
          <button type="button" className="adm-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>New</span>
          </button>
        </header>

        <div className="adm-c">
          {preview ? (
            <div style={{ marginBottom: 14, padding: "8px 14px", background: "#efe3cb", color: "#7b5c31", borderRadius: 8, font: "800 10px Manrope, sans-serif", letterSpacing: ".12em", textTransform: "uppercase", display: "inline-block" }}>
              Portal preview · Live data is gated
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
