import { Search, Filter } from "lucide-react";
import { and, count, desc, eq, ilike, inArray, isNull, or, sum, type SQL } from "drizzle-orm";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, engagements, invoices } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

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
export default async function ClientsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";

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
  let counts: Record<string, number> = {};
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    const base = isNull(clients.archivedAt);
    const conditions: SQL[] = [base];
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
      const c = await db
        .select({ n: count() })
        .from(clients)
        .where(and(base, f.key ? eq(clients.status, f.key) : undefined));
      counts[f.key] = Number(c[0]?.n ?? 0);
    }
    totalAll = counts[""] ?? 0;
  } catch {
    unavailable = true;
  }

  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/clients">
      <div className="adm-page-h">
        <div>
          <h1>Clients</h1>
          <div className="sub">
            {unavailable ? "Unavailable" : `${rows.length} shown · ${totalAll} total`}
          </div>
        </div>
      </div>

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
                    {f.label} · {counts[f.key] ?? 0}
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
                            <strong>{r.displayName}</strong>
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
    </AdminShell>
  );
}

