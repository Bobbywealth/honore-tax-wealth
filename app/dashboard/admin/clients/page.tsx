import { Search, Filter, Upload, Plus } from "lucide-react";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, sum, type SQL } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import NewClientForm from "./new-client-form";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, engagements, invoices } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { navForRole } from "../_lib/nav";
import { scopedClientIdsFor } from "../_lib/scoping";
import {
  AGENT_LIST_FILTERS,
  loadAgentClientRows,
  type AgentClientRow,
  type AgentListBucket,
} from "../_lib/agentList";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Real client records.
 *
 * The previous version was a static array of twelve invented clients with
 * realistic email addresses, invented "lifetime value" figures, and invented
 * return counts. Revenue is not shown here at all: the schema has no
 * billed-lifetime field, so any number displayed would have been invented.
 */
export default async function ClientsPage({ searchParams }: { searchParams?: Promise<{ q?: string; bucket?: string; status?: string; imported?: string; errors?: string; report?: string; new?: string; created?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const me = await currentUser();
  const counts: Record<string, number> & { unanswered: number; conversationsUnread: number } = await loadAdminNavCounts() as any;
  const nav = navForRole(me?.role, counts);

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const bucket = (params.bucket ?? (params.status ?? "")) as AgentListBucket | "";
  const showForm = params.new === "1";
  const justCreated = params.created === "1";
  const importedCount = Number(params.imported ?? 0);
  const importErrorCount = Number(params.errors ?? 0);
  let importReport: Array<{ row: number; message: string }> = [];
  if (params.report) {
    try {
      const decoded = Buffer.from(params.report, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) importReport = parsed.filter((x) => typeof x?.row === "number" && typeof x?.message === "string");
    } catch {
      importReport = [];
    }
  }

  let rows: (AgentClientRow & { openInvoiceCount: number; billedTotal: string })[] = [];
  let totalAll = 0;
  let statusCounts: Record<string, number> = {};
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    const base = isNull(clients.archivedAt);
    const conditions: SQL[] = [base];
    // Non-admin staff (agent / assistant) only see clients explicitly
    // assigned to them — via clients.owner_id or via any non-archived
    // engagement's owner_id. Admins see everything. The helper queries
    // both assignments in two indexed lookups instead of an EXISTS
    // scan per row, and the resulting array is reused for the filter
    // chips below so they count exactly the rows visible on the page.
    let scopedClientIds: string[] | null = null;
    if (me?.id) {
      scopedClientIds = await scopedClientIdsFor({ id: me.id, role: me.role });
      if (scopedClientIds !== null) conditions.push(inArray(clients.id, scopedClientIds));
    }
    if (query) {
      conditions.push(
        or(
          ilike(clients.displayName, `%${query}%`),
          ilike(clients.legalName, `%${query}%`),
          ilike(clients.email, `%${query}%`),
        )!,
      );
    }

    // The bucket is derived from live engagement / return / request state, not
    // a stored column, so it cannot be filtered in SQL here. Fetch the narrow
    // id set first, enrich it once, then bucket and count in memory. A practice
    // has hundreds of clients, not millions, and this keeps the chip counts
    // exact instead of approximate.
    const candidateRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(...conditions))
      .orderBy(desc(clients.updatedAt))
      .limit(500);

    const candidateIds = candidateRows.map((r) => r.id);
    const enriched: (AgentClientRow & { openInvoiceCount: number; billedTotal: string })[] =
      (await loadAgentClientRows(candidateIds)) as (AgentClientRow & {
        openInvoiceCount: number;
        billedTotal: string;
      })[];

    // Client-level billing stays on the list because an agent needs to see an
    // unpaid invoice before scheduling filing.
    if (enriched.length > 0) {
      const invoiceRows = await db
        .select({
          clientId: invoices.clientId,
          n: count(),
          total: sum(invoices.total),
        })
        .from(invoices)
        .where(
          and(
            or(eq(invoices.status, "sent"), eq(invoices.status, "overdue")),
            inArray(invoices.clientId, enriched.map((r) => r.id)),
          ),
        )
        .groupBy(invoices.clientId);
      const byClient = new Map(invoiceRows.map((r) => [r.clientId, r]));
      for (const r of enriched) {
        const inv = byClient.get(r.id);
        r.openInvoiceCount = Number(inv?.n ?? 0);
        r.billedTotal = String(inv?.total ?? "0");
      }
    } else {
      for (const r of enriched) {
        r.openInvoiceCount = 0;
        r.billedTotal = "0";
      }
    }

    for (const f of AGENT_LIST_FILTERS) {
      // Chips count only rows the user can actually see, so a non-admin never
      // sees counts that exceed what they are allowed to view.
      statusCounts[f.key] = enriched.filter((r) => (f.key ? r.bucket === f.key : true)).length;
    }
    totalAll = enriched.length;

    rows = bucket ? enriched.filter((r) => r.bucket === bucket) : enriched;
  } catch {
    unavailable = true;
  }


const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <DashboardShell audience="Admin" title="Clients" description="Every client record in one place, with their tax work, documents, and messages linked." nav={nav} currentHref="/dashboard/admin/clients">
      <div className="adm-page-h">
        <div>
          <h1>Clients</h1>
          <div className="sub">
            {unavailable ? "Unavailable" : `${rows.length} shown · ${totalAll} total`}
          </div>
        </div>
        <a className="adm-btn" href="?new=1" title="Add a client manually">
          <Plus size={13} /> Add client
        </a>
      </div>

      {justCreated ? (
        <div className="adm-import-results">
          <h3>Client added.</h3>
        </div>
      ) : null}

      {showForm ? <NewClientForm /> : null}

      <div className="adm-clients-upload">
        <div className="ico"><Upload size={18} aria-hidden="true" /></div>
        <div style={{ minWidth: 0 }}>
          <div className="t">Import clients from CSV</div>
          <div className="d">Excel / Google Sheets → export as CSV. Columns: Name (required) · legal_name · email · phone · entity_type · status · tax_id_last4 · address · city · state · zip · notes.</div>
        </div>
        <form action="/api/admin/clients/import" method="post" encType="multipart/form-data">
          <input type="file" name="file" accept=".csv,text/csv" required />
          <button type="submit" className="adm-btn"><Upload size={14} aria-hidden="true" /> Import</button>
        </form>
      </div>

      {importedCount > 0 || importErrorCount > 0 ? (
        <div className="adm-import-results">
          <h3>Last import: {importedCount} added · {importErrorCount} skipped / noted</h3>
          {importReport.length > 0 ? (
            <ul>
              {importReport.slice(0, 30).map((r, i) => (
                <li key={i} className={r.message.includes("skipped") ? "err" : ""}>Row {r.row}: {r.message}</li>
              ))}
              {importReport.length > 30 ? <li>… {importReport.length - 30} more (re-run with verbose logs)</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load clients. Nothing has been lost — try again shortly.</p>
        </div>
      ) : (
        <>
          <div className="adm-clients-toolbar">
            <form className="adm-clients-search" method="get">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search name or email…"
                aria-label="Search clients"
              />
              <input type="hidden" name="bucket" value={bucket} />
              <button type="submit" className="adm-btn">
                Search
              </button>
            </form>
            <div className="adm-clients-filters">
              {AGENT_LIST_FILTERS.map((f) => {
                const active = bucket === f.key;
                const href = f.key ? `?bucket=${f.key}` : "?";
                return (
                  <a
                    key={f.key || "all"}
                    className={`adm-clients-filter${active ? " active" : ""}`}
                    href={href}
                    aria-current={active ? "page" : undefined}
                  >
                    {f.label} · {statusCounts[f.key] ?? 0}
                  </a>
                );
              })}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="adm-empty">
              <Filter size={22} aria-hidden="true" />
              <h2>No clients found</h2>
              <p>
                {query || bucket
                  ? "Nothing matches those filters. Try clearing the search."
                  : "Clients appear here once a lead is converted."}
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="sr-only">Client records</caption>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Tax year</th>
                    <th scope="col">Return</th>
                    <th scope="col">Filing</th>
                    <th scope="col">Status</th>
                    <th scope="col">Documents</th>
                    <th scope="col">Last activity</th>
                    <th scope="col">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bucketLabel =
                      AGENT_LIST_FILTERS.find((f) => f.key === r.bucket)?.label ?? r.bucket;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="adm-client-cell">
                            <span className="av">{initials(r.displayName)}</span>
                            <div>
                              <strong>
                                <a href={`/dashboard/admin/clients/${r.id}`} className="adm-row-link">
                                  {r.displayName}
                                </a>
                              </strong>
                              {r.email ? (
                                <a href={`mailto:${r.email}`} className="adm-card-sub">
                                  {r.email}
                                </a>
                              ) : (
                                <span className="adm-card-meta">No email on file</span>
                              )}
                              {r.city ? (
                                <span className="adm-card-meta">
                                  {r.city}
                                  {r.state ? `, ${r.state}` : ""}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>{r.taxYear ?? <span className="adm-card-meta">—</span>}</td>
                        <td>{r.returnType ?? <span className="adm-card-meta">—</span>}</td>
                        <td>
                          {r.filingMethod === "paper" ? (
                            <span className="adm-badge adm-badge-warn">Paper</span>
                          ) : r.filingMethod === "efile" ? (
                            <span className="adm-badge">E-File</span>
                          ) : (
                            <span className="adm-card-meta">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`adm-badge adm-bucket-${r.bucket}`}>{bucketLabel}</span>
                        </td>
                        <td>
                          {r.docsTotal === 0 ? (
                            <span className="adm-card-meta">None requested</span>
                          ) : r.docsMissing > 0 ? (
                            <span className="adm-badge adm-badge-warn">
                              {r.docsMissing} missing
                            </span>
                          ) : (
                            <span className="adm-badge">{r.docsTotal} received</span>
                          )}
                        </td>
                        <td>
                          {r.lastActivityAt ? (
                            <time dateTime={new Date(r.lastActivityAt).toISOString()}>
                              {new Intl.DateTimeFormat("en-US", {
                                dateStyle: "medium",
                                timeZone: "America/New_York",
                              }).format(new Date(r.lastActivityAt))}
                            </time>
                          ) : (
                            <span className="adm-card-meta">—</span>
                          )}
                        </td>
                        <td>
                          {r.nextStep ? (
                            <span className="adm-next-step" title={r.nextStep}>
                              {r.nextStep}
                              {r.openTaskCount > 1 ? ` (+${r.openTaskCount - 1})` : ""}
                            </span>
                          ) : (
                            <span className="adm-card-meta">No follow-up</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

