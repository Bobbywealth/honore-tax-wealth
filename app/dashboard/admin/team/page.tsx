import { Plus, Mail } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth.tsx";

export const dynamic = "force-dynamic";

const team = [
  { name: "Bobby Wealth", initials: "BW", role: "Owner", tone: "", email: "bobby@honore-tax.com", returns: 12, hrs: "32h", status: "Active", on: true },
  { name: "Sharon Cole", initials: "SC", role: "Senior Preparer", tone: "bl", email: "sharon@honore-tax.com", returns: 14, hrs: "40h", status: "Active", on: true },
  { name: "David Park", initials: "DP", role: "Reviewer", tone: "gn", email: "david@honore-tax.com", returns: 6, hrs: "20h", status: "Active", on: true },
  { name: "Aanya Cole", initials: "AC", role: "Preparer", tone: "pu", email: "aanya@honore-tax.com", returns: 9, hrs: "28h", status: "Active", on: true },
  { name: "Marcus Hale", initials: "MH", role: "Admin Assistant", tone: "", email: "marcus@honore-tax.com", returns: 0, hrs: "16h", status: "Active", on: true },
  { name: "Lena Patel", initials: "LP", role: "Preparer · PT", tone: "bl", email: "lena@honore-tax.com", returns: 4, hrs: "12h", status: "Active", on: false },
];

export default async function TeamPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/team">
      <div className="adm-page-h">
        <div>
          <h1>Team</h1>
          <div className="sub">5 active · 1 part-time · 45 returns in motion · 148h logged this month</div>
        </div>
        <button className="adm-btn"><Plus size={13} /> Invite member</button>
      </div>

      <div className="adm-clients-toolbar">
        <div className="adm-clients-search">
          <input placeholder="Search team…" style={{ padding: "7px 10px", border: 0, outline: 0, flex: 1, font: "inherit" }} />
        </div>
        <button className="adm-clients-filter active">All · 6</button>
        <button className="adm-clients-filter">Owners · 1</button>
        <button className="adm-clients-filter">Preparers · 3</button>
        <button className="adm-clients-filter">Reviewers · 1</button>
        <button className="adm-clients-filter">Admin · 1</button>
        <div style={{ flex: 1 }} />
        <button className="adm-clients-filter">Sort: Workload ↓</button>
      </div>

      <div className="adm-team-grid">
        {team.map((m) => (
          <div key={m.email} className="adm-team-card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className={`av${m.tone ? " " + m.tone : ""}`} style={{ width: 52, height: 52, fontSize: 16, flex: "0 0 52px", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, color: "#fff", background: m.tone === "bl" ? "linear-gradient(135deg,#2a5d8f,#1a3d5f)" : m.tone === "gn" ? "linear-gradient(135deg,#2f8a5b,#1f5a3a)" : m.tone === "pu" ? "linear-gradient(135deg,#7a5ca8,#5a3c88)" : "linear-gradient(135deg,#d4a755,#a8853a)", boxShadow: "0 0 0 3px rgba(212,167,85,.15)" }}>{m.initials}</div>
              <div>
                <b>{m.name}</b>
                <div className="adm-sm">{m.email}</div>
              </div>
            </div>
            <div className="role">{m.role}</div>
            <div className={`status ${m.on ? "on" : "off"}`}>● {m.on ? "Online" : "Offline · last seen 2d ago"}</div>
            <div className="stats">
              <div className="stat"><div className="l">Active returns</div><div className="v">{m.returns}</div></div>
              <div className="stat"><div className="l">This week</div><div className="v">{m.hrs}</div></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button className="adm-btn" style={{ flex: 1, padding: "7px 10px", fontSize: 11, background: "#f1ede2", color: "#0e1a26", boxShadow: "none", justifyContent: "center" }}><Mail size={12} /> Message</button>
              <button className="adm-btn" style={{ flex: 1, padding: "7px 10px", fontSize: 11, justifyContent: "center" }}>Open</button>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
