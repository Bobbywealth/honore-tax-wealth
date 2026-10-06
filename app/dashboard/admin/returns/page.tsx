import { Search, Filter, Plus, Calendar, MoreHorizontal } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

const board = {
  Intake: [
    { client: "Marcus Hale", form: "1040 · Individual", amt: "$485", due: "Nov 15" },
    { client: "J. Okafor", form: "1065 · S-Corp", amt: "$1,240", due: "Oct 22" },
    { client: "N. Williams", form: "1120-S", amt: "$890", due: "Dec 1" },
  ],
  Docs: [
    { client: "S. Whitlock", form: "1120-S · K-1", amt: "$920", due: "Oct 28" },
    { client: "R. Castillo", form: "1040 · Sch C", amt: "$680", due: "Oct 30" },
    { client: "T. Brooks", form: "1065 Partner", amt: "$1,420", due: "Nov 5" },
    { client: "L. Adesanya", form: "1040 Joint", amt: "$540", due: "Oct 25" },
  ],
  "In prep": [
    { client: "Lena Rivera", form: "1040 · Sch C", amt: "$1,450", due: "Oct 12" },
    { client: "Aanya Patel", form: "1120-S · Partner", amt: "$2,180", due: "Oct 14" },
    { client: "M. Hassan", form: "1065 · Partnership", amt: "$3,420", due: "Oct 18" },
    { client: "K. Nguyen", form: "1040X", amt: "$1,120", due: "Oct 20" },
    { client: "S. Mitchell", form: "1040 + 1065", amt: "$2,640", due: "Oct 22" },
    { client: "E. O'Brien", form: "1120-S", amt: "$1,890", due: "Oct 24" },
  ],
  Review: [
    { client: "D. Park", form: "1040X · Amended", amt: "$1,890", due: "Oct 10" },
    { client: "M. Chen", form: "1040 + Sch C", amt: "$540", due: "Oct 13" },
    { client: "T. Vega", form: "1065 Partnership", amt: "$1,420", due: "Oct 16" },
  ],
  Approval: [
    { client: "Sharon Kim", form: "1040 · JOINT", amt: "$720", due: "Oct 11" },
    { client: "R. Patel", form: "1120-S", amt: "$1,640", due: "Oct 14" },
  ],
  Filed: [
    { client: "P. Hassan", form: "1065 · Partnership", amt: "$3,420", due: "✓ Filed" },
    { client: "J. Reyes", form: "1040", amt: "$640", due: "✓ Filed" },
    { client: "B. Cohen", form: "1120-S", amt: "$1,220", due: "✓ Filed" },
  ],
};

const stages: { key: keyof typeof board; color: string }[] = [
  { key: "Intake", color: "#8a97a3" },
  { key: "Docs", color: "#d4a755" },
  { key: "In prep", color: "#2a5d8f" },
  { key: "Review", color: "#7a5ca8" },
  { key: "Approval", color: "#c98a2e" },
  { key: "Filed", color: "#2f8a5b" },
];

export default async function ReturnsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/returns">
      <div className="adm-page-h">
        <div>
          <h1>Returns</h1>
          <div className="sub">85 returns in motion · 23 in prep · 3 ready for review · 41 filed this year</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}><Calendar size={13} /> Deadlines</button>
          <button className="adm-btn"><Plus size={13} /> New return</button>
        </div>
      </div>

      <div className="adm-board-toolbar">
        <div className="adm-clients-search" style={{ maxWidth: 340 }}>
          <Search size={14} />
          <input placeholder="Search by client, EIN, or form…" />
        </div>
        <button className="adm-clients-filter">Form: All</button>
        <button className="adm-clients-filter">Year: 2025</button>
        <button className="adm-clients-filter">Owner: All</button>
        <button className="adm-clients-filter active">Risk: All</button>
        <div style={{ flex: 1 }} />
        <button className="adm-clients-filter">Group: Stage</button>
      </div>

      <div className="adm-board">
        {stages.map((s) => (
          <div key={s.key} className="adm-col">
            <h4><span className="d" style={{ background: s.color }} />{s.key}<span className="ct">{board[s.key].length}</span></h4>
            {board[s.key].map((t) => (
              <div key={t.client} className="adm-board-ticket">
                <b>{t.client}</b>
                <div className="form">{t.form}</div>
                <div className="foot">
                  <span className="amt">{t.amt}</span>
                  <span className="due" style={{ color: t.due.startsWith("✓") ? "#2f8a5b" : "#a63b37" }}>{t.due}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
