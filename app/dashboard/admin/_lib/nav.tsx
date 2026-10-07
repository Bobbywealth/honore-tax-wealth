import type { PortalNavItem } from "../../DashboardShell";
// Icons are rendered inside DashboardShell from a static key map, so
// this helper only ships string keys and never sends Lucide components
// across the server/client boundary.

type Counts = {
  unanswered: number;
  conversationsUnread: number;
};

/**
 * Sidebar nav used on every admin portal page. Icons are pre-instantiated
 * JSX (not bare component references) so they survive server-to-client
 * serialization in App Router / Next 16.
 */
export function adminNav(counts: Counts): PortalNavItem[] {
  return [
    { href: "/dashboard/admin", label: "Dashboard", icon: "dashboard" },
    {
      href: "/dashboard/admin/inbox",
      label: "Inbox",
      icon: "inbox",
      badge: counts.unanswered > 0 ? { value: counts.unanswered, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/admin/messages",
      label: "Messages",
      icon: "messages",
      badge: counts.conversationsUnread > 0 ? { value: counts.conversationsUnread, tone: "red" as const } : undefined,
    },
    { href: "/dashboard/admin/clients", label: "Clients", icon: "clients" },
    { href: "/dashboard/admin/returns", label: "Returns", icon: "returns" },
    { href: "/dashboard/admin/documents", label: "Documents", icon: "documents" },
    { href: "/dashboard/admin/tasks", label: "Tasks", icon: "tasks" },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard/admin/leads", label: "Leads", icon: "leads" },
    { href: "/dashboard/admin/reports", label: "Reports", icon: "reports" },
    { href: "/dashboard/admin/team", label: "Team", icon: "team" },
    { href: "/dashboard/admin/settings", label: "Settings", icon: "settings" },
  ];
}
