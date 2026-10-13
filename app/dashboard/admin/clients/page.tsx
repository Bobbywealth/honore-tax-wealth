import { Search, Filter, Upload } from "lucide-react";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, sum, type SQL } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, engagements, invoices } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { navForRole } from "../_lib/nav";
import { scopedClientIdsFor } from "../_lib/scoping";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "prospect", label: "Prospect" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
] as const;

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
export default async function ClientsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; imported?: string; errors?: string; report?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const me = await currentUser();
  const counts: Record<string, number> & { unanswered: number; conversationsUnread: number } = await loadAdminNavCounts() as any;
  const nav = navForRole(me?.role, counts);

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
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

  let rows: Array<{
    id: string;
    displayName: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    entityType: string;
    status: string;
    city: string | null;
    state: string | null;
    updatedAt: Date;
    engagementCount: number;
    openInvoiceCount: number;
    billedTotal: string;
  }> = [];
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
    // scan per row, and the resulting array is reused for status chips
    // below so they count exactly the rows visible on the page.
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
    if (status) conditions.push(eq(clients.status, status));

    const baseRows = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        legalName: clients.legalName,
        email: clients.email,
        phone: clients.phone,
        entityType: clients.entityType,
        status: clients.status,
        city: clients.city,
        state: clients.state,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .where(and(...conditions))
      .orderBy(desc(clients.updatedAt))
      .limit(200);

    // Engagement and billing aggregates per client, so the table shows real
    // counts without an N+1 query per row.
    const ids = baseRows.map((r) => r.id);
    if (ids.length > 0) {
      const engagementRows = await db
        .select({ clientId: engagements.clientId, n: count() })
        .from(engagements)
        .where(and(isNull(engagements.archivedAt), inArray(engagements.clientId, ids)))
        .groupBy(engagements.clientId);
      const invoiceRows = await db
        .select({
          clientId: invoices.clientId,
          n: count(),
          total: sum(invoices.total),
        })
        .from(invoices)
        .where(and(or(eq(invoices.status, "sent"), eq(invoices.status, "overdue")), inArray(invoices.clientId, ids)))
        .groupBy(invoices.clientId);

      rows = baseRows.map((r) => {
        const e = engagementRows.find((x) => x.clientId === r.id);
        const i = invoiceRows.find((x) => x.clientId === r.id);
        return {
          ...r,
          engagementCount: Number(e?.n ?? 0),
          openInvoiceCount: Number(i?.n ?? 0),
          billedTotal: String(i?.total ?? "0"),
        };
      });
    } else {
      rows = baseRows.map((r) => ({
        ...r,
        engagementCount: 0,
        openInvoiceCount: 0,
        billedTotal: "0",
      }));
    }

    for (const f of STATUS_FILTERS) {
      // Status filter chips count only the rows the user can actually
      // see. Reuse the scoping computed above so a non-admin never sees
      // chip counts that exceed the rows they're allowed to view.
      const c = await db
        .select({ n: count() })
        .from(clients)
        .where(
          and(
            base,
            f.key ? eq(clients.status, f.key) : undefined,
            ...(scopedClientIds !== null ? [inArray(clients.id, scopedClientIds)] : []),
          ),
        );
      statusCounts[f.key] = Number(c[0]?.n ?? 0);
    }
    totalAll = statusCounts[""] ?? 0;
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
      </div>

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
              <input type="hidden" name="status" value={status} />
              <button type="submit" className="adm-btn">
                Search
              </button>
            </form>
            <div className="adm-clients-filters">
              {STATUS_FILTERS.map((f) => {
                const active = status === f.key;
                const href = f.key ? `?status=${f.key}` : "?";
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
                {query || status
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
                    <th scope="col">Type</th>
                    <th scope="col">Engagements</th>
                    <th scope="col">Open invoices</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
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
                      <td>{r.entityType}</td>
                      <td>{r.engagementCount}</td>
                      <td>{r.openInvoiceCount}</td>
                      <td>
                        <span className="adm-badge">{r.status}</span>
                      </td>
                      <td>
                        <time dateTime={new Date(r.updatedAt).toISOString()}>
                          {new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeZone: "America/New_York",
                          }).format(new Date(r.updatedAt))}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

