import type { PortalNavItem } from "../../DashboardShell";
import {
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Users,
  FileText,
  Receipt,
  ClipboardList,
  CalendarDays,
  UserPlus,
  BarChart3,
  Contact,
  Settings,
} from "lucide-react";

type Counts = {
  unanswered: number;
  conversationsUnread: number;
};

/**
 * Sidebar nav used on every admin portal page. Pass LucideIcon component
 * references (not JSX) so they survive server-to-client serialization
 * cleanly.
 */
export function adminNav(counts: Counts): PortalNavItem[] {
  return [
    { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard },
    {
      href: "/dashboard/admin/inbox",
      label: "Inbox",
      icon: Mail,
      badge: counts.unanswered > 0 ? { value: counts.unanswered, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/admin/messages",
      label: "Messages",
      icon: MessageSquareText,
      badge: counts.conversationsUnread > 0 ? { value: counts.conversationsUnread, tone: "red" as const } : undefined,
    },
    { href: "/dashboard/admin/clients", label: "Clients", icon: Users },
    { href: "/dashboard/admin/returns", label: "Returns", icon: ClipboardList },
    { href: "/dashboard/admin/documents", label: "Documents", icon: FileText },
    { href: "/dashboard/admin/tasks", label: "Tasks", icon: Receipt },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/dashboard/admin/leads", label: "Leads", icon: UserPlus },
    { href: "/dashboard/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/dashboard/admin/team", label: "Team", icon: Contact },
    { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  ];
}
