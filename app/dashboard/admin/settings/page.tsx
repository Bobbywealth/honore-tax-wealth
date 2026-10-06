import { User, Building2, Palette, Bell, Lock, Mail, CreditCard, FileText, Users, Plug } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

const nav = [
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

const profileRows = [
  { label: "Display name", value: "Bobby Wealth" },
  { label: "Email", value: "bobby@honore-tax.com" },
  { label: "Phone", value: "+1 (973) 555-0100" },
  { label: "Time zone", value: "America/New_York" },
  { label: "Signature", value: "Bobby Wealth, EA · Honoré Tax & Wealth" },
];

const notifications = [
  { label: "New consultation request", sub: "Email + push · immediate", on: true },
  { label: "E-file rejection", sub: "Email + push + SMS · immediate", on: true },
  { label: "IRS/state deadline 7-day warning", sub: "Email · daily digest", on: true },
  { label: "Client reply in inbox", sub: "Push only", on: true },
  { label: "Weekly practice pulse", sub: "Email · Monday 8am", on: true },
  { label: "Daily end-of-day summary", sub: "Off", on: false },
];

const integrations = [
  { name: "Stripe", desc: "Retainers and engagement fees", on: true, connected: true },
  { name: "Twilio", desc: "SMS notifications and intake confirmations", on: true, connected: true },
  { name: "SendGrid", desc: "Transactional email", on: true, connected: true },
  { name: "DocuSign", desc: "Engagement letters and 8879 e-file auths", on: false, connected: false },
  { name: "Plaid", desc: "Client bank statements for cash flow analysis", on: false, connected: false },
  { name: "QuickBooks Online", desc: "Bookkeeping import for 1065/1120-S", on: true, connected: true },
];

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/settings">
      <div className="adm-page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Practice, team, branding, integrations, and security</div>
        </div>
      </div>

      <div className="adm-settings-grid">
        <nav className="adm-settings-nav">
          {nav.map((n, i) => {
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
          <section className="adm-settings-pane" id="profile">
            <h3>Profile</h3>
            <div className="sub">How you appear to staff and clients across Honoré.</div>
            {profileRows.map((r) => (
              <div key={r.label} className="adm-settings-row">
                <div>
                  <b>{r.label}</b>
                  <div className="sm">{r.value}</div>
                </div>
                <button className="adm-clients-filter">Edit</button>
              </div>
            ))}
            <div className="adm-settings-row">
              <div>
                <b>Profile photo</b>
                <div className="sm">PNG, JPG, or WebP · 512×512 minimum</div>
              </div>
              <div className="av" style={{ width: 40, height: 40, fontSize: 13, background: "linear-gradient(135deg,#d4a755,#a8853a)", color: "#0a1828", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700 }}>BW</div>
            </div>
          </section>

          <section className="adm-settings-pane" id="practice" style={{ marginTop: 14 }}>
            <h3>Practice</h3>
            <div className="sub">Firm details, EIN, addresses, and intake settings.</div>
            <div className="adm-settings-row">
              <div><b>Legal name</b><div className="sm">Honoré Tax & Wealth LLC</div></div>
              <button className="adm-clients-filter">Edit</button>
            </div>
            <div className="adm-settings-row">
              <div><b>EIN</b><div className="sm">83-*******</div></div>
              <button className="adm-clients-filter">Reveal</button>
            </div>
            <div className="adm-settings-row">
              <div><b>Office address</b><div className="sm">1400 Burnet Ave, Union, NJ 07083</div></div>
              <button className="adm-clients-filter">Edit</button>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>Accept new clients</b>
                <div className="sm">When off, the consultation form is hidden site-wide</div>
              </div>
              <button className="adm-switch on" aria-label="Accept new clients"></button>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>Tax season surcharge</b>
                <div className="sm">Add 15% to all fees from Feb 1 – Apr 15</div>
              </div>
              <button className="adm-switch" aria-label="Tax season surcharge"></button>
            </div>
          </section>

          <section className="adm-settings-pane" id="notifications" style={{ marginTop: 14 }}>
            <h3>Notifications</h3>
            <div className="sub">Choose what gets your attention and how.</div>
            {notifications.map((n) => (
              <div key={n.label} className="adm-settings-row">
                <div><b>{n.label}</b><div className="sm">{n.sub}</div></div>
                <button className={`adm-switch${n.on ? " on" : ""}`} aria-label={n.label}></button>
              </div>
            ))}
          </section>

          <section className="adm-settings-pane" id="integrations" style={{ marginTop: 14 }}>
            <h3>Integrations</h3>
            <div className="sub">Connect the tools your practice already uses.</div>
            {integrations.map((i) => (
              <div key={i.name} className="adm-settings-row">
                <div>
                  <b>{i.name}{i.connected ? <span style={{ marginLeft: 8, fontSize: 10, color: "#2f8a5b", fontWeight: 600, letterSpacing: ".5px" }}>● CONNECTED</span> : null}</b>
                  <div className="sm">{i.desc}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className={`adm-switch${i.on ? " on" : ""}`} aria-label={i.name}></button>
                  <button className="adm-clients-filter">{i.connected ? "Manage" : "Connect"}</button>
                </div>
              </div>
            ))}
          </section>

          <section className="adm-settings-pane" id="security" style={{ marginTop: 14 }}>
            <h3>Security & audit</h3>
            <div className="sub">Sign-in, session, and audit-log controls.</div>
            <div className="adm-settings-row">
              <div>
                <b>Two-factor authentication</b>
                <div className="sm">Required for all staff — SMS + TOTP</div>
              </div>
              <span className="adm-tag gr">ENFORCED</span>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>Idle session timeout</b>
                <div className="sm">Sign out after 30 min of inactivity</div>
              </div>
              <select className="adm-input">
                <option>15 min</option>
                <option>30 min</option>
                <option>1 hour</option>
                <option>4 hours</option>
              </select>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>SSN masking</b>
                <div className="sm">Show only last 4 digits anywhere a SSN appears</div>
              </div>
              <button className="adm-switch on" aria-label="SSN masking"></button>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>Audit log retention</b>
                <div className="sm">Keep every sign-in and data change</div>
              </div>
              <select className="adm-input">
                <option>90 days</option>
                <option>1 year</option>
                <option selected>3 years</option>
                <option>7 years (IRS recommended)</option>
              </select>
            </div>
            <div className="adm-settings-row">
              <div>
                <b>Download audit log</b>
                <div className="sm">CSV export of all staff actions</div>
              </div>
              <button className="adm-clients-filter">Download</button>
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
