import type { PortalNavItem } from "../../DashboardShell";
// Icons are rendered inside DashboardShell from a static key map, so
// this helper only ships string keys and never sends Lucide components
// across the server/client boundary.

type Counts = {
  unanswered: number;
  conversationsUnread: number;
  conversationsUnreadAll?: number;
};

/**
 * Role-aware nav resolver. Admins get the full 11-item admin nav.
 * Agents + assistants + staff get the 7-item scoped set Bobby asked for:
 * Dashboard, Clients, Returns, Documents, Tasks, Calendar, Settings.
 * Other / unverified roles fall back to the agent set too so a freshly
 * logged-in non-admin is never offered Inbox / Messages / Leads /
 * Reports / Team (where they could in theory damage a practice by
 * reassigning client ownership or sending mass SMS).
 *
 * Decisions about which data each agent can see still live on the page
 * itself (Clients/Returns/Calendar scope to engagements.owner_id = the
 * agent's id); this helper just hides the cross-practice nav entries.
 */
export function navForRole(role: string | null | undefined, counts: Counts): PortalNavItem[] {
  if (role === "admin") return adminNav(counts);
  return agentNav(counts);
}

export function adminNav(counts: Counts): PortalNavItem[] {
  return [
    { href: "/dashboard/admin", label: "Dashboard", icon: "dashboard" },
    {
      href: "/dashboard/admin/inbox",
      label: "Inbox",
      icon: "inbox",
      badge: counts.unanswered > 0 ? { value: counts.unanswered, tone: "red" as const } : undefined,
    },

    { href: "/dashboard/admin/clients", label: "Clients", icon: "clients" },
    { href: "/dashboard/admin/returns", label: "Returns", icon: "returns" },
    { href: "/dashboard/admin/documents", label: "Documents", icon: "documents" },
    { href: "/dashboard/admin/tasks", label: "Tasks", icon: "tasks" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard/admin/forms", label: "Forms", icon: "clipboard" },
    { href: "/dashboard/admin/leads", label: "Leads", icon: "leads" },
    { href: "/dashboard/admin/reports", label: "Reports", icon: "reports" },
    { href: "/dashboard/admin/team", label: "Team", icon: "team" },
    { href: "/dashboard/admin/settings", label: "Settings", icon: "settings" },
  ];
}

/**
 * Scoped nav for non-admin staff. Same icon/dict shape so DashboardShell
 * renders identical chips, just fewer items.
 */
export function agentNav(counts: Counts): PortalNavItem[] {
  return [
    { href: "/dashboard/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients", icon: "clients" },
    { href: "/dashboard/admin/forms", label: "Forms", icon: "clipboard" },
    { href: "/dashboard/admin/returns", label: "Returns", icon: "returns" },
    { href: "/dashboard/admin/documents", label: "Documents", icon: "documents" },
    { href: "/dashboard/admin/tasks", label: "Tasks", icon: "tasks" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard/admin/settings", label: "Settings", icon: "settings" },
  ];
}
