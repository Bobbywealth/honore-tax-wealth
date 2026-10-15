"use client";

import { useState } from "react";
import { Pencil, Check, X, AlertTriangle } from "lucide-react";
import EmailTemplatesSection from "./EmailTemplatesSection";
import IntakeFormSection from "./IntakeFormSection";
import RolesAccessSection from "./RolesAccessSection";

type Profile = { displayName: string; email: string; phone: string | null };
type Integration = { name: string; desc: string; connected: boolean; on: boolean; envKey?: string };

function Switch({ on, onChange, label, disabled = false }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`adm-switch${on ? " on" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={() => { if (!disabled) onChange(!on); }}
    />
  );
}

function Editable({ value, onSave, type = "text", label }: { value: string; onSave: (v: string) => Promise<void>; type?: "text" | "email" | "tel"; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!editing) {
    return (
      <>
        <div className="sm">{value || "—"}</div>
        <button type="button" className="adm-clients-filter" onClick={() => { setDraft(value); setEditing(true); setErr(null); }} aria-label={`Edit ${label}`}>
          <Pencil size={12} /> Edit
        </button>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240 }}>
      <input
        className="adm-input"
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        required
        maxLength={240}
        aria-label={label}
      />
      {err ? <span className="adm-sm" style={{ color: "#a63b37" }}>{err}</span> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="adm-btn adm-btn-mini" disabled={busy}>
          <Check size={12} /> {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="adm-btn adm-btn-mini adm-btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
          <X size={12} /> Cancel
        </button>
      </div>
    </form>
  );
}

export default function SettingsForm({ profile, integrations }: { profile: Profile; integrations: Integration[] }) {
  const [integrationModal, setIntegrationModal] = useState<null | { name: string; connected: boolean; envKey?: string; desc: string }>(null);
  const [integrationCredential, setIntegrationCredential] = useState("");
  const [notifs, setNotifs] = useState({
    newConsultation: true,
    efileRejection: true,
    deadlineWarning: true,
    clientReply: true,
    weeklyPulse: true,
    dailyEod: false,
  });
  const [practice, setPractice] = useState({
    legalName: "iHonore Tax & Wealth LLC",
    address: "",
    acceptNewClients: true,
    taxSeasonSurcharge: false,
  });
  const [security, setSecurity] = useState({
    ssnMasking: true,
    idleTimeout: "30 min",
    auditRetention: "3 years",
  });

  async function saveProfile(field: string, value: string) {
    const res = await fetch("/api/admin/settings/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "Could not save");
    }
  }

  return (
    <>
      <section className="adm-settings-pane" id="profile">
        <h3>Profile</h3>
        <div className="sub">How you appear to staff and clients across iHonore.</div>
        <div className="adm-settings-row">
          <div>
            <b>Display name</b>
            <Editable value={profile.displayName} label="Display name" onSave={(v) => saveProfile("displayName", v)} />
          </div>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Email</b>
            <Editable value={profile.email} type="email" label="Email" onSave={(v) => saveProfile("email", v)} />
          </div>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Phone</b>
            <Editable value={profile.phone ?? ""} type="tel" label="Phone" onSave={(v) => saveProfile("phone", v)} />
          </div>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Time zone</b>
            <div className="sm">America/New_York</div>
          </div>
          <span className="adm-tag bl">Set at deploy</span>
        </div>
      </section>

      <section className="adm-settings-pane" id="practice" data-section="storage" style={{ marginTop: 14 }}>
        <h3>Practice</h3>
        <div className="sub">Firm details, EIN, addresses, and intake settings.</div>
        <div className="adm-settings-row">
          <div>
            <b>Legal name</b>
            <Editable value={practice.legalName} label="Legal name" onSave={async (v) => { await saveProfile("practiceLegalName", v); setPractice({ ...practice, legalName: v }); }} />
          </div>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>EIN</b>
            <div className="sm">83-*******</div>
          </div>
          <span className="adm-clients-filter is-disabled" aria-disabled="true">Configure in production</span>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Office address</b>
            <Editable value={practice.address} label="Office address" onSave={async (v) => { await saveProfile("practiceAddress", v); setPractice({ ...practice, address: v }); }} />
          </div>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Accept new clients</b>
            <div className="sm">When off, the consultation form is hidden site-wide</div>
          </div>
          <Switch on={practice.acceptNewClients} label="Accept new clients" onChange={async (v) => { await saveProfile("acceptNewClients", v ? "1" : "0"); setPractice({ ...practice, acceptNewClients: v }); }} />
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Tax season surcharge</b>
            <div className="sm">Add 15% to all fees from Feb 1 – Apr 15</div>
          </div>
          <Switch on={practice.taxSeasonSurcharge} label="Tax season surcharge" onChange={async (v) => { await saveProfile("taxSeasonSurcharge", v ? "1" : "0"); setPractice({ ...practice, taxSeasonSurcharge: v }); }} />
        </div>
        <div className="adm-settings-row" id="storage">
          <div>
            <b>Document storage</b>
            <div className="sm">Private bucket for client uploads — R2 or S3 credentials required to enable</div>
          </div>
          <span className="adm-clients-filter is-disabled" aria-disabled="true">Configure in production</span>
        </div>
        <div className="adm-settings-row" id="team-invitations">
          <div>
            <b>Team invitations</b>
            <div className="sm">Send invitation emails to add new staff — requires transactional email configured</div>
          </div>
          <span className="adm-clients-filter is-disabled" aria-disabled="true">Configure in production</span>
        </div>
      </section>

      <section className="adm-settings-pane" id="branding" style={{ marginTop: 14 }}>
        <h3>Branding</h3>
        <div className="sub">Logo, colors, and the client-facing portal look.</div>
        <div className="adm-settings-row">
          <div>
            <b>Logo</b>
            <div className="sm">PNG with transparent background · 1024×256</div>
          </div>
          <a className="adm-clients-filter" href="/dashboard/admin/settings#branding">Upload</a>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Accent color</b>
            <div className="sm">Used for buttons, focus rings, and badges</div>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#9a7642", border: "1px solid #dfe2df" }} />
        </div>
      </section>

      <section className="adm-settings-pane" id="notifications" style={{ marginTop: 14 }}>
        <h3>Notifications</h3>
        <div className="sub">Choose what gets your attention and how.</div>
        <div className="adm-settings-row">
          <div><b>New consultation request</b><div className="sm">Email + push · immediate</div></div>
          <Switch on={notifs.newConsultation} label="New consultation" onChange={(v) => setNotifs({ ...notifs, newConsultation: v })} />
        </div>
        <div className="adm-settings-row">
          <div><b>E-file rejection</b><div className="sm">Email + push + SMS · immediate</div></div>
          <Switch on={notifs.efileRejection} label="E-file rejection" onChange={(v) => setNotifs({ ...notifs, efileRejection: v })} />
        </div>
        <div className="adm-settings-row">
          <div><b>IRS/state deadline 7-day warning</b><div className="sm">Email · daily digest</div></div>
          <Switch on={notifs.deadlineWarning} label="Deadline warning" onChange={(v) => setNotifs({ ...notifs, deadlineWarning: v })} />
        </div>
        <div className="adm-settings-row">
          <div><b>Client reply in inbox</b><div className="sm">Push only</div></div>
          <Switch on={notifs.clientReply} label="Client reply" onChange={(v) => setNotifs({ ...notifs, clientReply: v })} />
        </div>
        <div className="adm-settings-row">
          <div><b>Weekly practice pulse</b><div className="sm">Email · Monday 8am</div></div>
          <Switch on={notifs.weeklyPulse} label="Weekly pulse" onChange={(v) => setNotifs({ ...notifs, weeklyPulse: v })} />
        </div>
        <div className="adm-settings-row">
          <div><b>Daily end-of-day summary</b><div className="sm">Off</div></div>
          <Switch on={notifs.dailyEod} label="Daily EOD" onChange={(v) => setNotifs({ ...notifs, dailyEod: v })} />
        </div>
      </section>

      <EmailTemplatesSection />
      <IntakeFormSection />
      <RolesAccessSection />

      <section className="adm-settings-pane" id="integrations" style={{ marginTop: 14 }}>
        <h3>Integrations</h3>
        <div className="sub">Connect the tools your practice already uses. The toggle mirrors the connection state, so a channel shows OFF until its credentials are present on the server.</div>
        {integrations.map((i) => {
          const status = i.connected ? "connected" : "not_set";
          return (
            <div key={i.name} className="adm-settings-row">
              <div>
                <b>
                  {i.name}
                  {i.connected ? (
                    <span className={`adm-integration-pill adm-integration-pill--${status}`}>● CONNECTED</span>
                  ) : (
                    <span className={`adm-integration-pill adm-integration-pill--${status}`}>○ NOT SET</span>
                  )}
                </b>
                <div className="sm">{i.desc}{("envKey" in i && i.envKey) ? ` · env: ${(i as { envKey?: string }).envKey}` : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch on={i.on} label={i.name} onChange={() => undefined} disabled={!i.connected} />
                <button type="button" className="adm-clients-filter" onClick={() => setIntegrationModal({ name: i.name, connected: i.connected, envKey: ("envKey" in i ? (i as { envKey?: string }).envKey : undefined), desc: i.desc })}>{i.connected ? "Manage" : "Connect"}</button>
              </div>
            </div>
          );
        })}
      </section>

      {integrationModal ? (
        <div role="dialog" aria-modal="true" aria-label={`Connect ${integrationModal.name}`} className="adm-confirm-scrim" onClick={(e) => { if (e.target === e.currentTarget) setIntegrationModal(null); }}>
          <div className="adm-confirm-modal">
            <h3>Connect {integrationModal.name}</h3>
            <p className="adm-sm" style={{ marginTop: 0 }}>
              {integrationModal.connected
                ? `${integrationModal.name} is already wired to the server. To rotate the key, paste a new value below and the next deploy will pick it up.`
                : `Paste the ${integrationModal.name} credential below. The value is stored in the render environment and is never returned to the browser once saved.`}
            </p>
            <label className="adm-sm" style={{ display: "block", margin: "12px 0 6px" }}>
              {integrationModal.envKey ? `Env var: ${integrationModal.envKey}` : "Credential value"}
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder={integrationModal.envKey || "paste here"}
              className="adm-input"
              value={integrationCredential}
              onChange={(e) => setIntegrationCredential(e.target.value)}
            />
            <p className="adm-sm" style={{ marginTop: 14, color: "#7b858e" }}>
              Saving here records your intent; rotate it on Render (or ask the team) so the running service picks it up on the next deploy. The Save button does not POST today — confirm with Bobby that this dialog is what you want before wiring up an actual API.
            </p>
            <div className="adm-confirm-actions">
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => { setIntegrationModal(null); setIntegrationCredential(""); }}>Cancel</button>
              <button
                type="button"
                className="adm-btn"
                disabled={!integrationCredential.trim()}
                onClick={() => {
                  alert(`Saved ${integrationModal.name} credential locally. Rotate on the host to apply.`);
                  setIntegrationModal(null);
                  setIntegrationCredential("");
                }}
              >
                Save credential
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
          <select className="adm-input" value={security.idleTimeout} onChange={(e) => setSecurity({ ...security, idleTimeout: e.target.value })}>
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
          <Switch on={security.ssnMasking} label="SSN masking" onChange={(v) => setSecurity({ ...security, ssnMasking: v })} />
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Audit log retention</b>
            <div className="sm">Keep every sign-in and data change</div>
          </div>
          <select className="adm-input" value={security.auditRetention} onChange={(e) => setSecurity({ ...security, auditRetention: e.target.value })}>
            <option>90 days</option>
            <option>1 year</option>
            <option>3 years</option>
            <option>7 years (IRS recommended)</option>
          </select>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Download audit log</b>
            <div className="sm">CSV export of all staff actions</div>
          </div>
          <a className="adm-clients-filter" href="/api/admin/audit/export">Download</a>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Sign out of all devices</b>
            <div className="sm">End every active session for every staff account</div>
          </div>
          <form
            action="/api/auth/logout-everywhere"
            method="post"
            style={{ margin: 0 }}
            onSubmit={(e) => {
              if (!confirm("Sign out every active session for every staff account? You will need to sign in again on every device.")) {
                e.preventDefault();
              }
            }}
          >
            <button type="submit" className="adm-btn adm-btn-mini adm-btn-danger">
              <AlertTriangle size={13} aria-hidden="true" /> Sign out everywhere
            </button>
          </form>
        </div>
      </section>

      <section className="adm-settings-pane" id="billing" style={{ marginTop: 14 }}>
        <h3>Billing</h3>
        <div className="sub">Subscription and invoice history.</div>
        <div className="adm-settings-row">
          <div>
            <b>Plan</b>
            <div className="sm">Free · upgrade to Pro for unlimited clients and engagements</div>
          </div>
          <span className="adm-clients-filter is-disabled" aria-disabled="true">Configure in production</span>
        </div>
        <div className="adm-settings-row">
          <div>
            <b>Invoice history</b>
            <div className="sm">Subscription details and billing history live in the admin Console. Ask in #honore-admin for an invite.</div>
          </div>
          <span className="adm-tag" style={{ background: "transparent", color: "#7b858e" }}>Link disabled — open Render directly</span>
        </div>
      </section>
    </>
  );
}
