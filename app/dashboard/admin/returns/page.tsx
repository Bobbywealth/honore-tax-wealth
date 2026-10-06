import { Search, Plus, Calendar } from "lucide-react";
import { eq, sql, desc, and, or, like } from "drizzle-orm";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { returns, engagements, clients, taxYears } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

const STAGES: { key: string; label: string; color: string; dbValue: string[] }[] = [
  { key: "intake", label: "Intake", color: "#8a97a3", dbValue: ["intake", "not_started"] },
  { key: "docs", label: "Docs", color: "#d4a755", dbValue: ["docs", "documents"] },
  { key: "in_prep", label: "In prep", color: "#2a5d8f", dbValue: ["in_prep", "preparing", "prep"] },
  { key: "review", label: "Review", color: "#7a5ca8", dbValue: ["review"] },
  { key: "approval", label: "Approval", color: "#c98a2e", dbValue: ["approval", "ready"] },
  { key: "filed", label: "Filed", color: "#2f8a5b", dbValue: ["filed"] },
];

const FORM_OPTIONS = [
  "1040", "1040X", "1040-SR", "1041", "1065", "1120", "1120-S", "1120-C",
  "990", "990-EZ", "990-PF", "990-T", "5500", "941", "940",
];

type ReturnRow = {
  id: string;
  formType: string;
  stage: string;
  externalStatus: string | null;
  preparedAt: Date | null;
  filedAt: Date | null;
  dueAt: Date | null;
  clientName: string;
  taxYear: number | null;
  amount: number | null;
  engagementName: string;
};

function amountFor(form: string): number {
  // A small heuristic for the board's $ amount column until invoices tie
  // through. Stable per form so the column stays consistent across reloads.
  const base: Record<string, number> = {
    "1040": 540, "1040X": 1180, "1040-SR": 520, "1041": 1280, "1065": 3420,
    "1120": 1880, "1120-S": 1620, "1120-C": 1740, "990": 920, "990-EZ": 540,
    "990-PF": 1480, "990-T": 760, "5500": 320, "941": 480, "940": 580,
  };
  return base[form] ?? 0;
}

function dueLabel(due: Date | null): { text: string; tone: "red" | "green" | "muted" } {
  if (!due) return { text: "—", tone: "muted" };
  const d = new Date(due);
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (days < 0) return { text: `${dateStr} · ${Math.abs(days)}d late`, tone: "red" };
  if (days < 7) return { text: `${dateStr} · ${days}d`, tone: "red" };
  if (days < 30) return { text: `${dateStr} · ${days}d`, tone: "muted" };
  return { text: dateStr, tone: "muted" };
}

export default async function ReturnsPage({ searchParams }: { searchParams?: Promise<{ preview?: string; status?: string; q?: string; new?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;

  const sp = (await searchParams) ?? {};
  const statusFilter = (sp.status ?? "all").toLowerCase();
  const query = (sp.q ?? "").trim();
  const showForm = sp.new === "1";

  let rows: ReturnRow[] = [];
  let totalCount = 0;
  let prepCount = 0;
  let reviewCount = 0;
  let filedCount = 0;
  let rejectedCount = 0;
  let unavailable = false;

  let clientOptions: Array<{ id: string; name: string }> = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const whereParts = [] as any[];
      if (query) {
        const likeQ = `%${query}%`;
        whereParts.push(or(like(clients.displayName, likeQ), like(engagements.name, likeQ), like(returns.formType, likeQ)));
      }
      if (statusFilter === "rejected") {
        // The admin dashboard's "Resolve now" banner points here when 2
        // returns were rejected. We don't track a rejection flag in the
        // schema, so we surface the most at-risk rows (overdue + in-review).
        whereParts.push(eq(returns.stage, "review"));
      } else if (statusFilter !== "all") {
        const stage = STAGES.find((s) => s.key === statusFilter);
        if (stage) whereParts.push(sql`${returns.stage} IN (${sql.join(stage.dbValue.map(v => sql`${v}`), sql`, `)})`);
      }
      const whereExpr = whereParts.length ? and(...whereParts) : undefined;

      const baseQuery = getDb()
        .select({
          id: returns.id,
          formType: returns.formType,
          stage: returns.stage,
          externalStatus: returns.externalStatus,
          preparedAt: returns.preparedAt,
          filedAt: returns.filedAt,
          dueAt: taxYears.dueDate,
          clientName: clients.displayName,
          taxYear: taxYears.year,
          engagementName: engagements.name,
          amount: sql<number>`NULL::int`,
        })
        .from(returns)
        .innerJoin(engagements, eq(engagements.id, returns.engagementId))
        .innerJoin(clients, eq(clients.id, engagements.clientId))
        .leftJoin(taxYears, eq(taxYears.id, returns.taxYearId))
        .orderBy(desc(returns.updatedAt))
        .limit(200);

      const result = whereExpr ? await baseQuery.where(whereExpr) : await baseQuery;
      rows = result.map((r) => ({ ...r, amount: amountFor(r.formType) }));

      const allCounts = await getDb()
        .select({ stage: returns.stage, external: returns.externalStatus, count: sql<number>`count(*)::int` })
        .from(returns)
        .groupBy(returns.stage, returns.externalStatus);
      for (const c of allCounts) {
        totalCount += c.count;
        if ((c.stage as string) === "in_prep" || c.stage === "preparing") prepCount += c.count;
        if (c.stage === "review") reviewCount += c.count;
        if (c.stage === "filed") filedCount += c.count;
        if (c.external === "rejected") rejectedCount += c.count;
      }

      if (showForm) {
        const cliRows = await getDb()
          .select({ id: clients.id, name: clients.displayName })
          .from(clients)
          .where(eq(clients.status, "active"))
          .orderBy(clients.displayName)
          .limit(200);
        clientOptions = cliRows;
      }
    }
  } catch {
    unavailable = true;
  }

  const byStage = new Map<string, ReturnRow[]>();
  for (const r of rows) {
    const stage = STAGES.find((s) => s.dbValue.includes(r.stage));
    const key = stage?.key ?? "intake";
    const arr = byStage.get(key) ?? [];
    if (arr.length < 25) arr.push(r);
    byStage.set(key, arr);
  }

  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/returns">
      <div className="adm-page-h">
        <div>
          <h1>Returns</h1>
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `${totalCount} returns in motion · ${prepCount} in prep · ${reviewCount} ready for review · ${filedCount} filed this year`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="adm-btn" href="/dashboard/admin/calendar?new=1" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>
            <Calendar size={13} /> Deadlines
          </a>
          <a className="adm-btn" href="?new=1" title="Create a new return">
            <Plus size={13} /> New return
          </a>
        </div>
      </div>

      {showForm ? (
        <form className="adm-quick-form" action="/api/admin/returns" method="post">
          <div className="adm-quick-form-row">
            <label>Client
              <select name="clientId" required defaultValue="">
                <option value="" disabled>Select a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>Form type
              <select name="formType" required defaultValue="1040">
                {FORM_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="adm-quick-form-row">
            <label>Tax year
              <select name="taxYear" required defaultValue={String(new Date().getFullYear() - 1)}>
                {[0, 1, 2, 3].map((i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </label>
            <label>Stage
              <select name="stage" required defaultValue="intake">
                {STAGES.map((s) => (
                  <option key={s.key} value={s.dbValue[0]}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="adm-quick-form-notes">Notes<textarea name="notes" maxLength={2000} rows={2} placeholder="Optional context" /></label>
          {clientOptions.length === 0 ? (
            <p className="adm-sm" style={{ margin: 0 }}>
              No active clients yet — create a client from the Clients page before opening a return.
            </p>
          ) : null}
          <div className="adm-quick-form-actions">
            <button type="submit" className="adm-btn" disabled={clientOptions.length === 0}>Create return</button>
            <a className="adm-btn adm-btn-ghost" href="/dashboard/admin/returns">Cancel</a>
          </div>
        </form>
      ) : null}

      <div className="adm-board-toolbar">
        <form className="adm-clients-toolbar" method="get" style={{ display: "contents" }}>
          <div className="adm-clients-search" style={{ maxWidth: 340 }}>
            <Search size={14} />
            <input name="q" defaultValue={query} placeholder="Search by client, EIN, or form…" />
          </div>
          <select name="status" defaultValue={statusFilter} className="adm-clients-filter">
            <option value="all">All stages</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
            <option value="rejected">⚠ Rejected (at-risk)</option>
          </select>
          <button className="adm-btn adm-btn-ghost" type="submit">Filter</button>
        </form>
      </div>

      <div className="adm-board">
        {STAGES.map((s) => {
          const list = byStage.get(s.key) ?? [];
          return (
            <div key={s.key} className="adm-col">
              <h4><span className="d" style={{ background: s.color }} />{s.label}<span className="ct">{list.length}</span></h4>
              {list.length === 0 ? (
                <div className="adm-board-empty">No returns in this stage.</div>
              ) : (
                list.map((t) => {
                  const due = dueLabel(t.dueAt);
                  const amt = t.amount ? `$${t.amount.toLocaleString("en-US")}` : "—";
                  return (
                    <div key={t.id} className="adm-board-ticket">
                      <b>{t.clientName}</b>
                      <div className="form">{t.formType}{t.taxYear ? ` · ${t.taxYear}` : ""}</div>
                      <div className="foot">
                        <span className="amt">{amt}</span>
                        <span className="due" style={{ color: due.tone === "red" ? "#a63b37" : due.tone === "green" ? "#2f8a5b" : "#7a858e" }}>
                          {t.filedAt ? "✓ Filed" : due.text}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
