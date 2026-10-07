import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, engagements, invoices, leads, returns } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

type Period = "month" | "quarter" | "ytd";

function startOf(period: Period, ref = new Date()): Date {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (period === "month") return new Date(Date.UTC(y, m, 1));
  if (period === "quarter") return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
  return new Date(Date.UTC(y, 0, 1));
}

function fmtUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtUSDPlain(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ preview?: string; period?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;

  const nav = adminNav(await loadAdminNavCounts());

  const sp = (await searchParams) ?? {};
  const period: Period = sp.period === "quarter" || sp.period === "ytd" ? sp.period : "month";
  const since = startOf(period);
  const monthStart = startOf("month");

  let kpi = { mtdRevenue: 0, periodRevenue: 0, ytdRevenue: 0, returnsFiled: 0, activeEngagements: 0, totalLeads: 0 };
  let monthly: Array<{ m: string; rev: number }> = [];
  let byFormType: Array<{ form: string; amt: number; count: number }> = [];
  let topClients: Array<{ id: string; name: string; initials: string; type: string; returns: number; life: number }> = [];
  let leadSources: Array<{ source: string; count: number }> = [];
  let unavailable = false;

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();

      // Revenue MTD + period + YTD
      const revRows = await getDb()
        .select({
          total: sum(invoices.total),
          paidAt: invoices.paidAt,
        })
        .from(invoices);
      let ytd = 0, mtd = 0, periodTotal = 0;
      for (const r of revRows) {
        if (!r.paidAt) continue;
        const paid = new Date(r.paidAt);
        const v = Number(r.total ?? 0);
        if (paid >= new Date(Date.UTC(paid.getUTCFullYear(), 0, 1))) ytd += v;
        if (paid >= monthStart) mtd += v;
        if (paid >= since) periodTotal += v;
      }
      kpi.ytdRevenue = ytd;
      kpi.mtdRevenue = mtd;
      kpi.periodRevenue = periodTotal;

      // Returns filed (any time)
      const ret = await getDb().select({ c: count() }).from(returns).where(eq(returns.stage, "filed"));
      kpi.returnsFiled = ret[0]?.c ?? 0;

      // Active engagements
      const eg = await getDb().select({ c: count() }).from(engagements).where(eq(engagements.status, "active"));
      kpi.activeEngagements = eg[0]?.c ?? 0;

      // Total leads
      const ld = await getDb().select({ c: count() }).from(leads);
      kpi.totalLeads = ld[0]?.c ?? 0;

      // Monthly revenue for the year (chart)
      const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
      const paidThisYear = await getDb()
        .select({ total: invoices.total, paidAt: invoices.paidAt })
        .from(invoices)
        .where(gte(invoices.paidAt, yearStart));
      const byMonth = new Array(12).fill(0);
      for (const r of paidThisYear) {
        if (!r.paidAt) continue;
        const m = new Date(r.paidAt).getUTCMonth();
        byMonth[m] += Number(r.total ?? 0);
      }
      monthly = byMonth.map((rev, i) => ({ m: MONTHS[i], rev }));

      // Returns by form type
      const rByForm = await getDb()
        .select({ formType: returns.formType })
        .from(returns);
      const formMap = new Map<string, { count: number }>();
      for (const r of rByForm) {
        const m = formMap.get(r.formType) ?? { count: 0 };
        m.count += 1;
        formMap.set(r.formType, m);
      }
      // No invoice totals on returns, so estimate per form using same heuristic as returns page
      const formAmt: Record<string, number> = { "1040": 540, "1040X": 1180, "1040-SR": 520, "1041": 1280, "1065": 3420, "1120": 1880, "1120-S": 1620, "1120-C": 1740, "990": 920, "990-EZ": 540 };
      byFormType = Array.from(formMap.entries())
        .map(([form, v]) => ({ form, count: v.count, amt: (formAmt[form] ?? 600) * v.count }))
        .sort((a, b) => b.amt - a.amt)
        .slice(0, 6);

      // Top clients by lifetime fee = sum of paid invoices
      const top = await getDb()
        .select({
          id: clients.id,
          name: clients.displayName,
          entityType: clients.entityType,
          total: sum(invoices.total),
        })
        .from(clients)
        .leftJoin(invoices, eq(invoices.clientId, clients.id))
        .groupBy(clients.id, clients.displayName, clients.entityType)
        .orderBy(desc(sum(invoices.total)))
        .limit(5);
      const retByClient = await getDb()
        .select({ clientId: engagements.clientId, c: count() })
        .from(returns)
        .innerJoin(engagements, eq(engagements.id, returns.engagementId))
        .groupBy(engagements.clientId);
      const retMap = new Map(retByClient.map((r) => [r.clientId, r.c]));
      topClients = top.map((c, i) => {
        const initials = c.name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
        return {
          id: c.id,
          name: c.name,
          initials,
          type: c.entityType,
          returns: retMap.get(c.id) ?? 0,
          life: Number(c.total ?? 0),
        };
      });

      // Lead sources (count by source)
      const ls = await getDb()
        .select({ source: leads.source, c: count() })
        .from(leads)
        .groupBy(leads.source);
      leadSources = ls.map((r) => ({ source: r.source, count: Number(r.c) }));
    }
  } catch {
    unavailable = true;
  }

  const maxBar = Math.max(1, ...byFormType.map((b) => b.amt));
  const maxLead = Math.max(1, ...leadSources.map((l) => l.count));
  const monthMax = Math.max(1, ...monthly.map((m) => m.rev));

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/reports" audience="Admin" title="Reports" description="Practice pulse and trend reports across consultations, returns, leads, and clients.">
      <div className="adm-page-h">
        <div>
          <h1>Reports</h1>
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `Practice pulse · ${kpi.returnsFiled} returns filed · ${kpi.activeEngagements} active engagements · ${kpi.totalLeads} leads in pipeline`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="?period=month" className={`adm-btn ${period === "month" ? "" : "adm-btn-ghost"}`} style={period === "month" ? {} : { background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>This month</a>
          <a href="?period=quarter" className={`adm-btn ${period === "quarter" ? "" : "adm-btn-ghost"}`} style={period === "quarter" ? {} : { background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>This quarter</a>
          <a href="?period=ytd" className={`adm-btn ${period === "ytd" ? "" : "adm-btn-ghost"}`} style={period === "ytd" ? {} : { background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>YTD</a>
          <a className="adm-btn" href="/api/admin/reports/export?period={period}" title="Download a CSV of paid invoices">Export CSV</a>
        </div>
      </div>

      <div className="adm-rp-grid">
        <div className="adm-rp-kpi"><div className="l">Revenue {period === "ytd" ? "YTD" : period === "quarter" ? "this quarter" : "MTD"}</div><div className="n">{fmtUSDPlain(period === "ytd" ? kpi.ytdRevenue : kpi.periodRevenue)}</div><div className="delta adm-up">YTD: {fmtUSD(kpi.ytdRevenue)}</div></div>
        <div className="adm-rp-kpi"><div className="l">Returns filed</div><div className="n">{kpi.returnsFiled}</div><div className="delta adm-up">▲ live</div></div>
        <div className="adm-rp-kpi"><div className="l">Active engagements</div><div className="n">{kpi.activeEngagements}</div><div className="delta adm-up">▲ live</div></div>
        <div className="adm-rp-kpi"><div className="l">Leads in pipeline</div><div className="n">{kpi.totalLeads}</div><div className="delta adm-up">▲ live</div></div>
      </div>

      <div className="adm-rp-chart">
        <h3>Revenue by month <a href="?period=ytd">YTD view →</a></h3>
        <svg viewBox="0 0 800 200" style={{ width: "100%", height: 180 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#d4a755" stopOpacity=".5" />
              <stop offset="1" stopColor="#d4a755" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100, 150].map((y) => <line key={y} x1="0" x2="800" y1={170 - y} y2={170 - y} stroke="#f1ede2" strokeWidth="1" />)}
          {monthly.map((m, i) => {
            const x = 40 + i * 64;
            const h = (m.rev / monthMax) * 150;
            return (
              <g key={i}>
                <rect x={x} y={170 - h} width="40" height={h} rx="3" fill="url(#revGrad)" stroke="#d4a755" strokeWidth="1.5" />
                <text x={x + 20} y="190" textAnchor="middle" fontSize="9" fontFamily="Inter" fill="#7a858e" fontWeight="600">{m.m}</text>
                <text x={x + 20} y={170 - h - 6} textAnchor="middle" fontSize="10" fontFamily="Fraunces,Georgia" fill="#0e1a26" fontWeight="600">{fmtUSD(m.rev)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="adm-rp-row">
        <div className="adm-rp-chart">
          <h3>Returns by form type <a href="/dashboard/admin/returns">Detail →</a></h3>
          {byFormType.length === 0 ? <p className="adm-sm" style={{ marginTop: 8 }}>No returns yet.</p> : byFormType.map((r) => (
            <div key={r.form} className="adm-rp-bar">
              <div className="name">{r.form}</div>
              <div className="bar"><div className="fill" style={{ width: `${(r.amt / maxBar) * 100}%` }} /></div>
              <div className="val">{fmtUSDPlain(r.amt)} · {r.count}</div>
            </div>
          ))}
        </div>
        <div className="adm-rp-chart">
          <h3>Lead sources</h3>
          {leadSources.length === 0 ? <p className="adm-sm" style={{ marginTop: 8 }}>No leads yet.</p> : leadSources.map((r) => (
            <div key={r.source} className="adm-rp-bar">
              <div className="name">{r.source}</div>
              <div className="bar"><div className="fill" style={{ width: `${(r.count / maxLead) * 100}%` }} /></div>
              <div className="val">{r.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-rp-chart">
        <h3>Top clients by lifetime fee <a href="/dashboard/admin/clients">All clients →</a></h3>
        {topClients.length === 0 ? <p className="adm-sm" style={{ marginTop: 8 }}>No clients yet.</p> : (
          <div className="adm-table" style={{ border: 0, boxShadow: "none" }}>
            <table>
              <thead><tr><th>Client</th><th>Type</th><th>Returns</th><th>Lifetime</th></tr></thead>
              <tbody>
                {topClients.map((c) => (
                  <tr key={c.id}>
                    <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="av">{c.initials}</div><b>{c.name}</b></div></td>
                    <td className="muted">{c.type}</td>
                    <td><b>{c.returns}</b></td>
                    <td><b>{fmtUSDPlain(c.life)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
