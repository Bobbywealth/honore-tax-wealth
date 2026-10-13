import { Search, Filter, Upload, FileText } from "lucide-react";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { navForRole } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, documents, documentRequests } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { scopedClientIdsFor } from "../_lib/scoping";

export const dynamic = "force-dynamic";

const REVIEW_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

const CATEGORY_LABEL: Record<string, string> = {
  identity: "Identity",
  income: "Income",
  deductions: "Deductions",
  prior_return: "Prior return",
  business: "Business",
  other: "Other",
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(
    new Date(value),
  );
}

/**
 * Real document metadata only.
 *
 * The previous version listed thirteen invented tax documents with realistic
 * filenames attached to invented clients — Rivera_W2_2025.pdf,
 * Okafor_1099-MISC.pdf, Taylor_Q3_PL.pdf, Hassan_K1_2024.pdf. A populated
 * document list implies that clients' tax records are on file when none are,
 * and it is exactly the demonstration data the brief requires be kept out of
 * production.
 */
export default async function DocumentsPage({ searchParams }: { searchParams?: Promise<{ q?: string; new?: string; created?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const counts = await loadAdminNavCounts();
  const me = await currentUser();
  const nav = navForRole(me?.role, counts);

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const showForm = params.new === "1";
  const justCreated = params.created === "1";

  let rows: Array<{
    id: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    category: string;
    reviewStatus: string;
    scanStatus: string;
    createdAt: Date;
    clientName: string;
  }> = [];
  let outstandingRequests: Array<{
    id: string;
    title: string;
    description: string | null;
    dueAt: Date | null;
    createdAt: Date;
    clientName: string;
  }> = [];
  let outstanding = 0;
  let unavailable = false;
  let clientOptions: Array<{ id: string; name: string }> = [];

  try {
    await ensureMigrated();
    const db = getDb();

    const conditions = [isNull(documents.deletedAt)];
    // Non-admin agents only see documents for clients assigned to them.
    // Same helper Clients/Returns pages use — one source of truth for
    // "is this client visible to this user".
    if (me?.id && me.role !== "admin") {
      const scoped = await scopedClientIdsFor({ id: me.id, role: me.role });
      if (scoped !== null) conditions.push(inArray(documents.clientId, scoped));
    }
    if (query) {
      conditions.push(
        or(
          ilike(documents.originalFilename, `%${query}%`),
          ilike(clients.displayName, `%${query}%`),
        )!,
      );
    }

    rows = await db
      .select({
        id: documents.id,
        originalFilename: documents.originalFilename,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        category: documents.category,
        reviewStatus: documents.reviewStatus,
        scanStatus: documents.scanStatus,
        createdAt: documents.createdAt,
        clientName: clients.displayName,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(and(...conditions))
      .orderBy(desc(documents.createdAt))
      .limit(200);

    const reqConditions = [isNull(documentRequests.fulfilledAt)];
    // Non-admin agents only see requests for clients assigned to them —
    // same scoping as the documents list above.
    if (me?.id && me.role !== "admin") {
      const scoped = await scopedClientIdsFor({ id: me.id, role: me.role });
      if (scoped !== null) reqConditions.push(inArray(documentRequests.clientId, scoped));
    }
    outstandingRequests = await db
      .select({
        id: documentRequests.id,
        title: documentRequests.title,
        description: documentRequests.description,
        dueAt: documentRequests.dueAt,
        createdAt: documentRequests.createdAt,
        clientName: clients.displayName,
      })
      .from(documentRequests)
      .innerJoin(clients, eq(clients.id, documentRequests.clientId))
      .where(and(...reqConditions))
      .orderBy(desc(documentRequests.createdAt))
      .limit(100);
    outstanding = outstandingRequests.length;

    if (showForm) {
      const cliRows = await db
        .select({ id: clients.id, name: clients.displayName })
        .from(clients)
        .where(isNull(clients.archivedAt))
        .orderBy(asc(clients.displayName))
        .limit(200);
      clientOptions = cliRows;
    }
  } catch {
    unavailable = true;
  }

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <DashboardShell audience="Admin" title="Documents" description="Files reviewed on intake, plus the document requests still waiting on the client." nav={nav} currentHref="/dashboard/admin/documents">
      <div className="adm-page-h">
        <div>
          <h1>Documents</h1>
          <div className="sub">
            {unavailable ? "Unavailable" : `${rows.length} on file · ${outstanding} outstanding requests`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a className="adm-btn" href="?new=1" title="Request a document from a client">
            <FileText size={13} /> New document request
          </a>
          <a className="adm-badge adm-badge-link" href="/dashboard/admin/settings#storage" title="Open storage settings to enable document uploads">
            <Upload size={13} aria-hidden="true" /> Upload not configured
          </a>
        </div>
      </div>

      {justCreated ? (
        <div className="adm-import-results">
          <h3>Document request sent.</h3>
        </div>
      ) : null}

      {showForm ? (
        <form className="adm-quick-form" action="/api/admin/document-requests" method="post">
          <div className="adm-quick-form-row">
            <label>Client
              <select name="clientId" required defaultValue="">
                <option value="" disabled>Select a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>Due date (optional)<input name="dueAt" type="date" /></label>
          </div>
          <label>Document title<input name="title" required minLength={2} maxLength={200} placeholder="e.g. 2025 W-2 from employer" /></label>
          <label className="adm-quick-form-notes">Description<textarea name="description" maxLength={2000} rows={2} placeholder="Optional — what exactly do you need?" /></label>
          {clientOptions.length === 0 ? (
            <p className="adm-sm" style={{ margin: 0 }}>
              No clients yet — add a client from the Clients page before requesting documents.
            </p>
          ) : null}
          <div className="adm-quick-form-actions">
            <button type="submit" className="adm-btn" disabled={clientOptions.length === 0}>Send request</button>
            <a className="adm-btn adm-btn-ghost" href="/dashboard/admin/documents">Cancel</a>
          </div>
        </form>
      ) : null}

      {!unavailable && outstandingRequests.length > 0 ? (
        <section className="adm-card" style={{ marginTop: 14 }}>
          <h3>Outstanding requests · {outstandingRequests.length}</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="sr-only">Document requests waiting on clients</caption>
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Client</th>
                  <th scope="col">Due</th>
                  <th scope="col">Asked</th>
                </tr>
              </thead>
              <tbody>
                {outstandingRequests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      {r.description ? (
                        <span className="adm-card-meta">{r.description}</span>
                      ) : null}
                    </td>
                    <td>{r.clientName}</td>
                    <td>
                      {r.dueAt ? (
                        <time dateTime={new Date(r.dueAt).toISOString()}>{formatDate(r.dueAt)}</time>
                      ) : (
                        <span className="adm-card-meta">No due date</span>
                      )}
                    </td>
                    <td>
                      <time dateTime={new Date(r.createdAt).toISOString()}>{formatDate(r.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load documents. Nothing has been lost — try again shortly.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <FileText size={22} aria-hidden="true" />
          <h2>No documents on file</h2>
          <p>
            {query
              ? "Nothing matches that search."
              : "Nothing has been uploaded yet. Document upload is wired through the client portal — once a client sends a document through their secure upload link, it appears here."}
          </p>
          {query ? (
            <a className="adm-btn" href="/dashboard/admin/documents">
              Clear search
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <form className="adm-clients-toolbar" method="get">
            <div className="adm-clients-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search filename or client…"
                aria-label="Search documents"
              />
              <button type="submit" className="adm-btn">
                Search
              </button>
            </div>
          </form>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="sr-only">Uploaded document metadata</caption>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Client</th>
                  <th scope="col">Category</th>
                  <th scope="col">Review</th>
                  <th scope="col">Scan</th>
                  <th scope="col">Size</th>
                  <th scope="col">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.originalFilename}</strong>
                      <span className="adm-card-meta">{r.contentType}</span>
                    </td>
                    <td>{r.clientName}</td>
                    <td>{CATEGORY_LABEL[r.category] ?? r.category}</td>
                    <td>
                      <span className="adm-badge">{REVIEW_LABEL[r.reviewStatus] ?? r.reviewStatus}</span>
                    </td>
                    <td>
                      <span className="adm-badge">{r.scanStatus}</span>
                    </td>
                    <td>{humanSize(r.sizeBytes)}</td>
                    <td>
                      <time dateTime={new Date(r.createdAt).toISOString()}>{formatDate(r.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardShell>
  );
}