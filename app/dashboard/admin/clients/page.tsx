import { Search, Filter, Plus, Download, Mail } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

const clients = [
  { name: "Marcus Taylor", initials: "MT", tone: "red", email: "marcus@hale-co.com", type: "1065 S-Corp", returns: 3, lifetime: "$4,820", status: "Active", statusTone: "gr", last: "2h ago" },
  { name: "Lena Rivera", initials: "LR", email: "lena@rivera-co.com", type: "1040 + Sch C", returns: 2, lifetime: "$2,310", status: "Active", statusTone: "gr", last: "12m ago" },
  { name: "David Park", initials: "DP", tone: "bl", email: "david@park-cpa.com", type: "1040X Amended", returns: 1, lifetime: "$1,890", status: "Engagement", statusTone: "am", last: "1h ago" },
  { name: "Sharon Kim", initials: "SK", tone: "gn", email: "sharon.k@gmail.com", type: "1040 Joint", returns: 1, lifetime: "$720", status: "Engagement signed", statusTone: "gr", last: "3h ago" },
  { name: "Priya Hassan", initials: "PH", tone: "pu", email: "priya@hassan-llc.com", type: "1065 Partnership", returns: 4, lifetime: "$8,940", status: "Filed", statusTone: "bl", last: "Yesterday" },
  { name: "Jordan Whitlock", initials: "JW", email: "j.whitlock@whitlock.co", type: "1120-S K-1", returns: 2, lifetime: "$1,840", status: "Docs pending", statusTone: "am", last: "Yesterday" },
  { name: "Aanya Patel", initials: "AP", email: "aanya@patel-co.com", type: "1120-S Partner", returns: 2, lifetime: "$4,180", status: "Active", statusTone: "gr", last: "Mon" },
  { name: "Ramon Castillo", initials: "RC", email: "ramon@castillo-co.com", type: "1040 + Sch C", returns: 1, lifetime: "$680", status: "Active", statusTone: "gr", last: "Sun" },
  { name: "Sara Mitchell", initials: "SM", tone: "bl", email: "sara@mitchell-law.com", type: "1040 + 1065", returns: 3, lifetime: "$5,420", status: "Active", statusTone: "gr", last: "Fri" },
  { name: "Henry Okafor", initials: "HO", email: "henry@okafor-ent.com", type: "1120-S + K-1", returns: 3, lifetime: "$3,720", status: "Overdue", statusTone: "rd", last: "14d ago" },
  { name: "Maya Chen", initials: "MC", tone: "gn", email: "maya@chen-studio.com", type: "1040 + Sch C", returns: 1, lifetime: "$540", status: "Active", statusTone: "gr", last: "3d ago" },
  { name: "Tomás Vega", initials: "TV", tone: "pu", email: "tomas@vega-co.com", type: "1065 Partnership", returns: 2, lifetime: "$2,890", status: "Filed", statusTone: "bl", last: "5d ago" },
];

export default async function ClientsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/clients">
      <div className="adm-page-h">
        <div>
          <h1>Clients</h1>
          <div className="sub">9 active · 2 in engagement · 1 overdue · 18 returns across the practice</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}><Download size={13} /> Export</button>
          <button className="adm-btn"><Plus size={13} /> New client</button>
        </div>
      </div>

      <div className="adm-clients-toolbar">
        <div className="adm-clients-search">
          <Search size={14} />
          <input placeholder="Search by name, email, or EIN…" />
        </div>
        <button className="adm-clients-filter active">All · 12</button>
        <button className="adm-clients-filter">Active · 9</button>
        <button className="adm-clients-filter">Engagement · 2</button>
        <button className="adm-clients-filter">Filed · 2</button>
        <button className="adm-clients-filter">Overdue · 1</button>
        <div style={{ flex: 1 }} />
        <button className="adm-clients-filter">Sort: Last activity ↓</button>
      </div>

      <div className="adm-table">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" /></th>
              <th>Client</th>
              <th>Type</th>
              <th>Returns</th>
              <th>Lifetime</th>
              <th>Status</th>
              <th>Last activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.name}>
                <td><input type="checkbox" /></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className={`av${c.tone ? " " + c.tone : ""}`}>{c.initials}</div>
                    <div>
                      <b>{c.name}</b>
                      <div className="muted">{c.email}</div>
                    </div>
                  </div>
                </td>
                <td className="muted">{c.type}</td>
                <td><b>{c.returns}</b></td>
                <td><b>{c.lifetime}</b></td>
                <td><span className={`adm-tag ${c.statusTone}`}>{c.status}</span></td>
                <td className="muted">{c.last}</td>
                <td style={{ textAlign: "right" }}>
                  <button style={{ background: "transparent", border: 0, color: "#9a7a2e", cursor: "pointer", fontWeight: 600, fontSize: 11, letterSpacing: ".5px" }}>OPEN →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
