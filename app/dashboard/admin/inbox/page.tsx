import { Mail, Search } from "lucide-react";
import { desc, eq, and, or, ilike } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { checkAdminAccess } from "../auth";
import { loadUnansweredCount } from "../lib/loadUnansweredCount";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { navForRole } from "../_lib/nav";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";

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

type SearchParams = Promise<{ q?: string; status?: string; id?: string }>;

type InboxRow = {
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
};

export default async function InboxPage({ searchParams }: { searchParams?: SearchParams }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  
  const _meAdminGate = await currentUser();
  if (_meAdminGate?.role !== 'admin' && _meAdminGate?.role !== undefined) {
    return (
      <main className="adm-restricted">
        <p>Admins only. This page is not available to agents.</p>
        <a href="/dashboard/admin">Back to dashboard</a>
      </main>
    );
  }
const counts = await loadAdminNavCounts();
  const me = await currentUser();
  const nav = navForRole(me?.role, counts);
  const unanswered = await loadUnansweredCount();

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const selectedId = Number(params.id ?? "");
  const hasSelection = Number.isFinite(selectedId) && selectedId > 0;

  let rows: Array<InboxRow> = [];
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
  let selected: InboxRow | null = hasSelection
    ? (rows.find((r) => r.id === selectedId) ?? null)
    : null;
  // The selected request may be filtered out of the list — load it directly
  // so a shared/bookmarked detail link still resolves.
  if (hasSelection && !selected && !unavailable) {
    try {
      const db = getDb();
      const found = await db
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
        .where(eq(consultations.id, selectedId))
        .limit(1);
      selected = found[0] ?? null;
    } catch {
      selected = null;
    }
  }
  // Preserve current filters when linking to a detail view.
  const filterSuffix =
    (query ? `&q=${encodeURIComponent(query)}` : "") + (status ? `&status=${status}` : "");

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
              <article
                key={r.id}
                className={`adm-inbox-i${selected?.id === r.id ? " active" : ""}`}
                style={{ position: "relative" }}
              >
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
                  <div className="row3" style={{ position: "relative", zIndex: 1 }}>
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                    {r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : null}
                  </div>
                </div>
                {/* Stretched link: whole row opens the detail view; the
                    mailto/tel links above stay clickable via z-index. */}
                <a
                  href={`/dashboard/admin/inbox?id=${r.id}${filterSuffix}`}
                  className="adm-inbox-hit"
                  aria-label={`View consultation request from ${r.name}`}
                />
              </article>
            ))}
          </div>

          <div className="adm-inbox-detail">
            {hasSelection && !selected && !unavailable ? (
              <div className="adm-empty">
                <h2>Request not found</h2>
                <p>That consultation request does not exist or is no longer available.</p>
                <a className="adm-btn" href={`/dashboard/admin/inbox${filterSuffix ? `?${filterSuffix.slice(1)}` : ""}`}>
                  Back to inbox
                </a>
              </div>
            ) : selected ? (
              <>
                <div className="adm-inbox-thread-head">
                  <div className="av">{initials(selected.name)}</div>
                  <div>
                    <b>{selected.name}</b>
                    <div className="sm">
                      {selected.service} · <code className="refcode">{selected.reference}</code>
                    </div>
                  </div>
                  <span className="adm-badge" style={{ marginLeft: "auto" }}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </span>
                </div>
                <div className="adm-inbox-thread-msgs">
                  <div className="adm-msg in">
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {selected.message || "No message was included."}
                    </p>
                    <div className="sm" style={{ marginTop: 8 }}>
                      Requested{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/New_York",
                      }).format(new Date(selected.requestedAt))}
                    </div>
                  </div>
                  <div className="adm-inbox-contact">
                    <div>
                      <span className="adm-sm">Email</span>
                      <a href={`mailto:${selected.email}`}>{selected.email}</a>
                    </div>
                    {selected.phone ? (
                      <div>
                        <span className="adm-sm">Phone</span>
                        <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="adm-inbox-actions">
                  <a
                    className="adm-btn"
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(
                      `Re: your consultation request (${selected.reference})`,
                    )}`}
                  >
                    Reply via email
                  </a>
                  <a className="adm-btn" href="/dashboard/admin/clients?new=1">
                    Convert to client
                  </a>
                </div>
                <div className="adm-inbox-actions" style={{ marginTop: 8 }}>
                  <span className="adm-sm" style={{ alignSelf: "center" }}>Set status:</span>
                  {[
                    { v: "in_progress", label: "Mark in progress" },
                    { v: "waiting_on_client", label: "Waiting on client" },
                    { v: "closed", label: "Close request" },
                  ]
                    .filter((o) => o.v !== selected.status)
                    .map((o) => (
                      <form
                        key={o.v}
                        action={`/api/admin/inbox/${selected.id}/status`}
                        method="post"
                        style={{ display: "inline" }}
                      >
                        <input type="hidden" name="status" value={o.v} />
                        <button type="submit" className="adm-btn adm-btn-ghost">
                          {o.label}
                        </button>
                      </form>
                    ))}
                </div>
              </>
            ) : (
              <div className="adm-empty">
                <Mail size={22} aria-hidden="true" />
                <h2>Select a request</h2>
                <p>Choose a consultation request from the list to see its details here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}