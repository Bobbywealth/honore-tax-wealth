import { Mail, Search } from "lucide-react";
import { desc, eq, and, or, ilike } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { checkAdminAccess } from "../auth";
import { loadUnansweredCount } from "../lib/loadUnansweredCount";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_client: "Waiting on client",
  closed: "Closed",
};

/** Compact relative time. Avoids a dependency for a display-only concern. */
function relative(value: Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(
    new Date(value),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function InboxPage({ searchParams }: { searchParams?: SearchParams }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const nav = adminNav(await loadAdminNavCounts());
  const unanswered = await loadUnansweredCount();

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";

  let rows: Array<{
    id: number;
    name: string;
    email: string;
    phone: string;
    service: string;
    message: string;
    status: string;
    reference: string;
    requestedAt: Date;
    createdAt: Date;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    const conditions = [];
    if (query) {
      conditions.push(
        or(
          ilike(consultations.name, `%${query}%`),
          ilike(consultations.email, `%${query}%`),
          ilike(consultations.reference, `%${query}%`),
          ilike(consultations.service, `%${query}%`),
        ),
      );
    }
    if (status && status in STATUS_LABEL) {
      conditions.push(eq(consultations.status, status));
    }

    rows = await db
      .select({
        id: consultations.id,
        name: consultations.name,
        email: consultations.email,
        phone: consultations.phone,
        service: consultations.service,
        message: consultations.message,
        status: consultations.status,
        reference: consultations.reference,
        requestedAt: consultations.requestedAt,
        createdAt: consultations.createdAt,
      })
      .from(consultations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(consultations.createdAt))
      .limit(100);
  } catch {
    unavailable = true;
  }

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <DashboardShell audience="Admin" title="Inbox" description="Every new consultation request from the public form lands here. Reply or convert to a client." nav={nav} currentHref="/dashboard/admin/inbox">
      <div className="adm-page-h">
        <div>
          <h1>Inbox</h1>
          {/* Counts reflect the rows actually loaded, never a fixed number. */}
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `${rows.length} consultation ${rows.length === 1 ? "request" : "requests"} · ${newCount} new`}
          </div>
        </div>
      </div>

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load consultation requests. Nothing has been lost — try again shortly.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <Mail size={22} aria-hidden="true" />
          <h2>No consultation requests</h2>
          <p>
            {query || status
              ? "Nothing matches those filters. Try clearing the search."
              : "Requests submitted through the public form will appear here."}
          </p>
          {query || status ? (
            <a className="adm-btn" href="/dashboard/admin/inbox">
              Clear filters
            </a>
          ) : null}
        </div>
      ) : (
        <div className="adm-inbox">
          <div className="adm-inbox-list">
            <form className="adm-inbox-search" method="get">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search name, email, reference…"
                aria-label="Search consultation requests"
              />
              <select name="status" defaultValue={status} aria-label="Filter by status">
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="submit" className="adm-btn">
                Filter
              </button>
            </form>

            {rows.map((r) => (
              <article key={r.id} className="adm-inbox-i">
                <div className="av">{initials(r.name)}</div>
                <div className="body">
                  <div className="row1">
                    <strong>{r.name}</strong>
                    <time dateTime={new Date(r.createdAt).toISOString()}>{relative(r.createdAt)}</time>
                  </div>
                  <div className="row2">
                    <span className="adm-tag">{r.service}</span>
                    <span className="adm-badge">{STATUS_LABEL[r.status] ?? r.status}</span>
                    <code className="refcode">{r.reference}</code>
                  </div>
                  {r.message ? <p className="preview">{r.message}</p> : null}
                  <div className="row3">
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                    {r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}