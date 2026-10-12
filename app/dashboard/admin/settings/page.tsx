import { User, Building2, Palette, Bell, Mail, FileText, Users, Plug, Lock, CreditCard } from "lucide-react";
import DashboardShell from "../../DashboardShell";import { navForRole } from "../_lib/nav";
import { loadAdminNavCounts } from "../lib/nav-counts";

import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

const sections = [
  { key: "profile", label: "Profile", icon: User },
  { key: "practice", label: "Practice", icon: Building2 },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "templates", label: "Email templates", icon: Mail },
  { key: "intake", label: "Intake forms", icon: FileText },
  { key: "team", label: "Roles & access", icon: Users },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "security", label: "Security & audit", icon: Lock },
  { key: "billing", label: "Billing", icon: CreditCard },
];

// on mirrors connected: the marketing page must never show 'ON' next to 'NOT SET'.
const stripeConnected = !!process.env.STRIPE_SECRET_KEY;
const twilioConnected = !!process.env.TWILIO_ACCOUNT_SID;
const emailConnected = !!process.env.SENDGRID_API_KEY || !!process.env.RESEND_API_KEY;
const docusignConnected = !!process.env.DOCUSIGN_INTEGRATION_KEY;
const plaidConnected = !!process.env.PLAID_CLIENT_ID;
const qboConnected = !!process.env.QBO_CLIENT_ID;

const integrations = [
  { name: "Stripe", desc: "Retainers and engagement fees", connected: stripeConnected, on: stripeConnected, envKey: "STRIPE_SECRET_KEY" },
  { name: "Twilio", desc: "SMS notifications and intake confirmations", connected: twilioConnected, on: twilioConnected, envKey: "TWILIO_ACCOUNT_SID" },
  { name: "SendGrid / Resend", desc: "Transactional email", connected: emailConnected, on: emailConnected, envKey: "SENDGRID_API_KEY or RESEND_API_KEY" },
  { name: "DocuSign", desc: "Engagement letters and 8879 e-file auths", connected: docusignConnected, on: docusignConnected, envKey: "DOCUSIGN_INTEGRATION_KEY" },
  { name: "Plaid", desc: "Client bank statements for cash flow analysis", connected: plaidConnected, on: plaidConnected, envKey: "PLAID_CLIENT_ID" },
  { name: "QuickBooks Online", desc: "Bookkeeping import for 1065/1120-S", connected: qboConnected, on: qboConnected, envKey: "QBO_CLIENT_ID" },
];

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;

  // Load the real user profile so the editable rows show actual values.
  let profile: { displayName: string; email: string; phone: string | null } = {
    displayName: "Bobby Wealth",
    email: "",
    phone: "",
  };
  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      // LIMIT 1 since this single-tenant app has one site owner row;
      // the access.user is available from the auth helper but passing
      // the id through every page is unnecessary noise.
      const rows = await getDb()
        .select({ displayName: users.displayName, email: users.email, phone: users.phone })
        .from(users)
        .limit(1);
      // We have a single-row site-owner; if present, use it.
      if (rows[0]) {
        profile = {
          displayName: rows[0].displayName ?? profile.displayName,
          email: rows[0].email ?? profile.email,
          phone: rows[0].phone ?? profile.phone,
        };
      }
    }
  } catch {
    // keep the default profile values
  }

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  const counts = await loadAdminNavCounts();
  const me = await currentUser();
  const nav = navForRole(me?.role, navCounts);  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/settings" audience="Admin" title="Settings" description="Practice, team, branding, integrations, and security.">
      <div className="adm-page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Practice, team, branding, integrations, and security</div>
        </div>
      </div>

      <div className="adm-settings-grid">
        <nav className="adm-settings-nav">
          {sections.map((n, i) => {
            const Icon = n.icon;
            return (
              <a key={n.key} href={`#${n.key}`} className={i === 0 ? "active" : ""}>
                <Icon size={15} />
                {n.label}
              </a>
            );
          })}
        </nav>

        <div>
          <SettingsForm profile={profile} integrations={integrations} />
        </div>
      </div>
    </DashboardShell>
  );
}
