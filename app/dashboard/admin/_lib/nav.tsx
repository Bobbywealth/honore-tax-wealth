import type { PortalNavItem } from "../../DashboardShell";
import {
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Users as UsersIcon,
  FileText,
  Receipt,
  ClipboardList,
  CalendarDays,
  UserPlus as UserPlusIcon,
  BarChart3,
  Contact,
  Settings,
} from "lucide-react";

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
    { href: "/dashboard/admin", label: "Dashboard", icon: <LayoutDashboard /> },
    {
      href: "/dashboard/admin/inbox",
      label: "Inbox",
      icon: <Mail />,
      badge: counts.unanswered > 0 ? { value: counts.unanswered, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/admin/messages",
      label: "Messages",
      icon: <MessageSquareText />,
      badge: counts.conversationsUnread > 0 ? { value: counts.conversationsUnread, tone: "red" as const } : undefined,
    },
    { href: "/dashboard/admin/clients", label: "Clients", icon: <UsersIcon /> },
    { href: "/dashboard/admin/returns", label: "Returns", icon: <ClipboardList /> },
    { href: "/dashboard/admin/documents", label: "Documents", icon: <FileText /> },
    { href: "/dashboard/admin/tasks", label: "Tasks", icon: <Receipt /> },
    { href: "/dashboard/admin/calendar", label: "Calendar", icon: <CalendarDays /> },
    { href: "/dashboard/admin/leads", label: "Leads", icon: <UserPlusIcon /> },
    { href: "/dashboard/admin/reports", label: "Reports", icon: <BarChart3 /> },
    { href: "/dashboard/admin/team", label: "Team", icon: <Contact /> },
    { href: "/dashboard/admin/settings", label: "Settings", icon: <Settings /> },
  ];
}
