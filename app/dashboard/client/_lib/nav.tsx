import type { PortalNavItem } from "../../DashboardShell";

export type ClientCounts = {
  openRequests: number;
  unpaidInvoices: number;
  upcomingAppointments: number;
  activeEngagements: number;
  pendingSignatures?: number;
};

/**
 * Sidebar nav used on every client portal page.
 *
 * `counts` drives the unread/overdue badges in the sidebar. Pass real numbers
 * here (or undefined values become null badges).
 */
export function clientNav(counts: ClientCounts): PortalNavItem[] {
  return [
    { href: "/dashboard/client", label: "Overview", icon: "overview" },
    {
      href: "/dashboard/client/engagements",
      label: "Tax work",
      icon: "tax-work",
      badge: counts.activeEngagements > 0 ? { value: counts.activeEngagements, tone: "default" as const } : undefined,
    },
    {
      href: "/dashboard/client/documents",
      label: "Documents",
      icon: "documents",
      badge: counts.openRequests > 0 ? { value: counts.openRequests, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/client/forms",
      label: "Forms to sign",
      icon: "clipboard",
      badge: (counts.pendingSignatures ?? 0) > 0 ? { value: counts.pendingSignatures ?? 0, tone: "red" as const } : undefined,
    },
    {
      href: "/dashboard/client/invoices",
      label: "Invoices",
      icon: "invoices",
      badge: counts.unpaidInvoices > 0 ? { value: counts.unpaidInvoices, tone: "amber" as const } : undefined,
    },
    {
      href: "/dashboard/client/appointments",
      label: "Appointments",
      icon: "appointments",
    },
  ];
}