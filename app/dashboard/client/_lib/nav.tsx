import type { PortalNavItem } from "../../DashboardShell";
import { LayoutDashboard, FileText, Receipt, MessageSquareText, CalendarDays, ClipboardList } from "lucide-react";

export type ClientCounts = {
  openRequests: number;
  unpaidInvoices: number;
  unreadMessages: number;
  upcomingAppointments: number;
  activeEngagements: number;
};

/**
 * Sidebar nav used on every client portal page.
 *
 * `counts` drives the unread/overdue badges in the sidebar. Pass real numbers
 * here (or undefined values become null badges).
 */
export function clientNav(counts: ClientCounts): PortalNavItem[] {
  return [
    { href: "/dashboard/client", label: "Overview", icon: <LayoutDashboard /> },
    {
      href: "/dashboard/client/engagements",
      label: "Tax work",
      icon: <ClipboardList />,
      badge: counts.activeEngagements > 0 ? { value: counts.activeEngagements, tone: "default" as const } : undefined,
    },
    {
      href: "/dashboard/client/documents",
      label: "Documents",
      icon: <FileText />,
      badge: counts.openRequests > 0 ? { value: counts.openRequests, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/client/invoices",
      label: "Invoices",
      icon: <Receipt />,
      badge: counts.unpaidInvoices > 0 ? { value: counts.unpaidInvoices, tone: "amber" as const } : undefined,
    },
    {
      href: "/dashboard/client/appointments",
      label: "Appointments",
      icon: <CalendarDays />,
    },
    {
      href: "/dashboard/client/messages",
      label: "Messages",
      icon: <MessageSquareText />,
      badge: counts.unreadMessages > 0 ? { value: counts.unreadMessages, tone: "red" as const } : undefined,
    },
  ];
}