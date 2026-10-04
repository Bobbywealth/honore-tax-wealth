import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth.tsx";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/reports">
      <div className="adm-page-h">
        <div>
          <h1>Reports</h1>
          <div className="sub">Practice pulse · October 2026 (Q4) · 4 clients added · 41 returns filed</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>This month</button>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>This quarter</button>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>YTD</button>
          <button className="adm-btn">Export PDF</button>
        </div>
      </div>

      <div className="adm-rp-grid">
        <div className="adm-rp-kpi"><div className="l">Revenue MTD</div><div className="n">$84.2<em>k</em></div><div className="delta adm-up">▲ 18% MoM</div></div>
        <div className="adm-rp-kpi"><div className="l">Returns filed</div><div className="n">41<em></em></div><div className="delta adm-up">▲ 12% MoM</div></div>
        <div className="adm-rp-kpi"><div className="l">Avg turnaround</div><div className="n">1.2<em>days</em></div><div className="delta adm-up">▼ 18% (faster)</div></div>
        <div className="adm-rp-kpi"><div className="l">Close rate (90d)</div><div className="n">38<em>%</em></div><div className="delta adm-up">▲ 4 pts</div></div>
      </div>

      <div className="adm-rp-chart">
        <h3>Revenue by month <a>Year view →</a></h3>
        <svg viewBox="0 0 800 200" style={{ width: "100%", height: 180 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#d4a755" stopOpacity=".5" />
              <stop offset="1" stopColor="#d4a755" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100, 150].map((y) => <line key={y} x1="0" x2="800" y1={170 - y} y2={170 - y} stroke="#f1ede2" strokeWidth="1" />)}
          {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((m, i) => {
            const x = 40 + i * 76;
            const h = [42, 38, 55, 78, 62, 58, 50, 68, 75, 84][i];
            return (
              <g key={i}>
                <rect x={x} y={170 - h * 1.5} width="36" height={h * 1.5} rx="3" fill="url(#revGrad)" stroke="#d4a755" strokeWidth="1.5" />
                <text x={x + 18} y="190" textAnchor="middle" fontSize="9" fontFamily="Inter" fill="#7a858e" fontWeight="600">{m}</text>
                <text x={x + 18} y={170 - h * 1.5 - 6} textAnchor="middle" fontSize="10" fontFamily="Fraunces,Georgia" fill="#0e1a26" fontWeight="600">${(h * 0.85).toFixed(1)}k</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="adm-rp-row">
        <div className="adm-rp-chart">
          <h3>Returns by form type <a>Detail →</a></h3>
          {[
            { name: "1040", val: 28, max: 35, amt: "$14,200" },
            { name: "1040 + Sch C", val: 16, max: 35, amt: "$12,800" },
            { name: "1065", val: 12, max: 35, amt: "$32,400" },
            { name: "1120-S", val: 9, max: 35, amt: "$14,940" },
            { name: "1040X", val: 5, max: 35, amt: "$6,100" },
            { name: "990", val: 2, max: 35, amt: "$2,800" },
          ].map((r) => (
            <div key={r.name} className="adm-rp-bar">
              <div className="name">{r.name}</div>
              <div className="bar"><div className="fill" style={{ width: `${(r.val / r.max) * 100}%` }} /></div>
              <div className="val">{r.amt}</div>
            </div>
          ))}
        </div>
        <div className="adm-rp-chart">
          <h3>Lead sources</h3>
          {[
            { name: "Referral", val: 48, max: 60 },
            { name: "Website", val: 24, max: 60 },
            { name: "Google", val: 16, max: 60 },
            { name: "LinkedIn", val: 8, max: 60 },
            { name: "Other", val: 4, max: 60 },
          ].map((r) => (
            <div key={r.name} className="adm-rp-bar">
              <div className="name">{r.name}</div>
              <div className="bar"><div className="fill" style={{ width: `${(r.val / r.max) * 100}%` }} /></div>
              <div className="val">{r.val}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-rp-chart">
        <h3>Top clients by lifetime fee <a>All clients →</a></h3>
        <div className="adm-table" style={{ border: 0, boxShadow: "none" }}>
          <table>
            <thead><tr><th>Client</th><th>Type</th><th>Returns</th><th>Years</th><th>Lifetime</th></tr></thead>
            <tbody>
              {[
                { name: "P. Hassan", initials: "PH", tone: "pu", type: "1065", returns: 4, years: 3, life: "$8,940" },
                { name: "Sara Mitchell", initials: "SM", tone: "bl", type: "1040 + 1065", returns: 3, years: 4, life: "$5,420" },
                { name: "Marcus Taylor", initials: "MT", tone: "red", type: "1065", returns: 3, years: 2, life: "$4,820" },
                { name: "Aanya Patel", initials: "AP", type: "1120-S", returns: 2, years: 2, life: "$4,180" },
                { name: "Henry Okafor", initials: "HO", type: "1120-S + K-1", returns: 3, years: 3, life: "$3,720" },
              ].map((c) => (
                <tr key={c.name}>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className={`av${c.tone ? " " + c.tone : ""}`}>{c.initials}</div><b>{c.name}</b></div></td>
                  <td className="muted">{c.type}</td>
                  <td><b>{c.returns}</b></td>
                  <td className="muted">{c.years}</td>
                  <td><b>{c.life}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
