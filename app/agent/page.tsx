import PortalLoginForm from "../_components/PortalLoginForm";

export const metadata = {
  title: "Agent sign in",
  description: "Team and management sign in for I Honore Tax & Wealth.",
};

/**
 * Agent / management sign-in.
 *
 * Deliberately a separate entry point from the client portal, not a tab on the
 * same form. The server enforces the split (`audience: "agent"` is rejected for
 * a `client` role account before any session or MFA challenge is issued), so
 * this page is the visible half of a real separation rather than a cosmetic
 * one.
 *
 * An agent lands on their own client list; an admin lands on the full workspace.
 */
export default function AgentLoginPage() {
  return (
    <PortalLoginForm
      audience="agent"
      eyebrow="TEAM & MANAGEMENT"
      title="Agent sign in."
      intro="Manage your assigned clients and their returns."
      emailPlaceholder="you@ihonoretaxandwealth.com"
      postLoginAdmin="/dashboard/admin"
      postLoginDefault="/dashboard/admin/clients"
      wrongPortalMessage="That account is a client account. Clients sign in through the client portal."
      note="Agent accounts are issued by management. Only clients you are assigned to appear in your workspace."
      footerLinks={[
        { href: "/forgot-password", label: "Forgot your password?" },
        { href: "/login", label: "Are you a client? Sign in here" },
      ]}
    />
  );
}
