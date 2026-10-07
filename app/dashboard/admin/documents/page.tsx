import { Search, Filter, Upload, FileText } from "lucide-react";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import AdminShell from "../AdminShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { clients, documents, documentRequests } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

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
export default async function DocumentsPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();

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
  let outstanding = 0;
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    const conditions = [isNull(documents.deletedAt)];
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

    const reqs = await db
      .select({ id: documentRequests.id })
      .from(documentRequests)
      .where(isNull(documentRequests.fulfilledAt));
    outstanding = reqs.length;
  } catch {
    unavailable = true;
  }

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/documents">
      <div className="adm-page-h">
        <div>
          <h1>Documents</h1>
          <div className="sub">
            {unavailable ? "Unavailable" : `${rows.length} on file · ${outstanding} outstanding requests`}
          </div>
        </div>
        <a className="adm-badge adm-badge-link" href="/dashboard/admin/settings#storage" title="Open storage settings to enable document uploads">
          <Upload size={13} aria-hidden="true" /> Upload not configured
        </a>
      </div>

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
              : "Nothing has been uploaded yet. Private document storage still needs a bucket and credentials, so there is no upload path here — clients are told to wait for a secure method from their preparer."}
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
    </AdminShell>
  );
}