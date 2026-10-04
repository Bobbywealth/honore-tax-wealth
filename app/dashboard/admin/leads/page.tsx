import { Plus, Globe, Phone, Users } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

const board = {
  New: [
    { name: "Daniel Kim", email: "daniel.k@gmail.com", source: "Website", value: "$1,400", note: "Wants Sch C + 1040" },
    { name: "Ana Reyes", email: "ana@reyes-studio.com", source: "Referral", value: "$890", note: "1040 + K-1" },
    { name: "J. Washington", email: "jwash@gmail.com", source: "Google", value: "$2,100", note: "First-time 1065" },
    { name: "L. Park", email: "l.park@park-co.com", source: "LinkedIn", value: "$3,200", note: "Multi-entity" },
  ],
  Qualified: [
    { name: "Mark Halpern", email: "mark@h-co.com", source: "Referral", value: "$2,800", note: "Discovery call done" },
    { name: "Riya Bose", email: "riya@bose.io", source: "Website", value: "$1,200", note: "K-1 recipient" },
  ],
  Proposal: [
    { name: "Stratos LLC", email: "ops@stratos.io", source: "LinkedIn", value: "$8,400", note: "1065 + payroll · sent Tue" },
    { name: "T. Williams", email: "twilliams@gmail.com", source: "Referral", value: "$1,640", note: "Engagement draft ready" },
  ],
  Won: [
    { name: "Sharon Kim", email: "sharon.k@gmail.com", source: "Referral", value: "$720", note: "Engagement signed" },
    { name: "P. Hassan", email: "priya@hassan-llc.com", source: "Website", value: "$3,420", note: "1065 partnership" },
  ],
  Lost: [
    { name: "GoLocal Inc", email: "ops@golocal.com", source: "Cold", value: "$0", note: "Out of scope · too small" },
  ],
};

const stages: { key: keyof typeof board; color: string; tone: string }[] = [
  { key: "New", color: "#7a5ca8", tone: "pu" },
  { key: "Qualified", color: "#2a5d8f", tone: "bl" },
  { key: "Proposal", color: "#c98a2e", tone: "am" },
  { key: "Won", color: "#2f8a5b", tone: "gr" },
  { key: "Lost", color: "#7a858e", tone: "muted" },
];

const totalValue = Object.values(board).flat().reduce((s, l) => s + (l.value.startsWith("$") ? parseInt(l.value.replace(/[$,]/g, "")) : 0), 0);

export default async function LeadsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/leads">
      <div className="adm-page-h">
        <div>
          <h1>Leads</h1>
          <div className="sub">12 open leads · $26,720 weighted pipeline · 38% close rate (90d)</div>
        </div>
        <button className="adm-btn"><Plus size={13} /> Add lead</button>
      </div>

      <div className="adm-leads-board">
        {stages.map((s) => {
          const total = board[s.key].reduce((sum, l) => sum + parseInt(l.value.replace(/[$,]/g, "") || "0"), 0);
          return (
            <div key={s.key} className="adm-col">
              <h4>
                <span className="d" style={{ background: s.color }} />
                {s.key}
                <span className="ct">{board[s.key].length}</span>
              </h4>
              <div style={{ fontSize: 10.5, color: "#9a7a2e", fontWeight: 600, marginBottom: 8, letterSpacing: ".3px" }}>${total.toLocaleString()} total</div>
              {board[s.key].map((l) => (
                <div key={l.email} className="adm-lead-card">
                  <b>{l.name}</b>
                  <div className="sm">{l.note}</div>
                  <div className="meta">
                    <span className="src">{l.source}</span>
                    <span className="val">{l.value}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
