import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, FileText, CheckCircle2, Circle } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import OpenChatButton from "../_components/OpenChatButton";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { engagements, taxYears, returns, documents, documentRequests, appointments, invoices, conversations } from "@/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";
import { formatServiceType } from "../../_lib/format";
import { clientFacingStatus } from "@/lib/client-status";

export const dynamic = "force-dynamic";

const ENGAGEMENT_STATUS: Record<string, string> = {
  intake: "Getting started",
  in_preparation: "In preparation",
  client_review: "Ready for your review",
  ready_to_file: "Ready to file",
  filed: "Submitted",
  complete: "Complete",
  on_hold: "On hold",
};
const RETURN_STATUS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  filed: "Filed",
  accepted: "Accepted",
};
const REVIEW_STATUS: Record<string, string> = {
  pending: "Under review",
  approved: "Approved",
  rejected: "Needs attention",
  superseded: "Replaced",
};

function dateOnly(value: Date | null, timeZone = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
}
function relative(value: Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateOnly(value);
}

async function loadCounts(clientId: string) {
  if (!process.env.DATABASE_URL) return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
  try {
    await ensureMigrated();
    const db = getDb();
    const [eg, req, appt, inv] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(engagements).where(and(eq(engagements.clientId, clientId), isNull(engagements.archivedAt))),
      db.select({ c: sql<number>`count(*)::int` }).from(documentRequests).where(and(eq(documentRequests.clientId, clientId), isNull(documentRequests.fulfilledAt))),
      db.select({ c: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.clientId, clientId), inArray(appointments.status, ["requested", "confirmed"]))),
      db.select({ c: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ["sent", "overdue"]))),
    ]);
    return {
      activeEngagements: eg[0]?.c ?? 0,
      openRequests: req[0]?.c ?? 0,
      upcomingAppointments: appt[0]?.c ?? 0,
      unpaidInvoices: inv[0]?.c ?? 0,
    };
  } catch {
    return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
  }
}

export default async function ClientEngagementsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/engagements");
  const clientId = await primaryClientFor(user);
  const nav = clientNav({
    activeEngagements: 0,
    openRequests: 0,
    upcomingAppointments: 0,
    unpaidInvoices: 0,
  });

  if (!clientId) {
    return (
      <DashboardShell audience="Client" title="Your tax work" description="" nav={nav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/engagements">
        <div className="dashboard-alert">
          <p><strong>No client record linked.</strong> Ask your preparer to connect your account.</p>
        </div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const updatedNav = clientNav(counts);

  let rows: Array<{
    id: string;
    name: string;
    serviceType: string;
    status: string;
    progressPercent: number;
    internalNotes: string | null;
    startedAt: Date | null;
    updatedAt: Date;
  }> = [];
  let taxYearsRows: Array<{ id: string; year: number; filingStatus: string; dueDate: Date | null; engagementId: string | null }> = [];
  let returnsByEngagement: Record<string, Array<{ id: string; formType: string; stage: string; preparedAt: Date | null; filedAt: Date | null }>> = {};
  let requestsByEngagement: Record<string, Array<{ id: string; title: string; required: boolean; dueAt: Date | null; fulfilledAt: Date | null }>> = {};
  let docsByEngagement: Record<string, Array<{ id: string; originalFilename: string; reviewStatus: string; createdAt: Date }>> = {};

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      rows = await db
        .select({
          id: engagements.id,
          name: engagements.name,
          serviceType: engagements.serviceType,
          status: engagements.status,
          progressPercent: engagements.progressPercent,
          internalNotes: engagements.internalNotes,
          startedAt: engagements.archivedAt,
          updatedAt: engagements.updatedAt,
        })
        .from(engagements)
        .where(and(eq(engagements.clientId, clientId), isNull(engagements.archivedAt)))
        .orderBy(desc(engagements.updatedAt));

      taxYearsRows = await db
        .select({ id: taxYears.id, year: taxYears.year, filingStatus: taxYears.filingStatus, dueDate: taxYears.dueDate, engagementId: taxYears.id })
        .from(taxYears)
        .where(eq(taxYears.clientId, clientId))
        .orderBy(desc(taxYears.year));

      const rets = await db
        .select({ id: returns.id, engagementId: returns.engagementId, formType: returns.formType, stage: returns.stage, preparedAt: returns.preparedAt, filedAt: returns.filedAt })
        .from(returns)
        .where(eq(returns.engagementId, sql`any (${sql.raw('(SELECT id FROM engagements WHERE client_id = ' + sql.raw(`'${clientId}'`) + ' AND archived_at IS NULL)')})`))
        .orderBy(desc(returns.updatedAt));
      for (const r of rets) {
        const arr = returnsByEngagement[r.engagementId] ?? [];
        arr.push({ id: r.id, formType: r.formType, stage: r.stage, preparedAt: r.preparedAt, filedAt: r.filedAt });
        returnsByEngagement[r.engagementId] = arr;
      }

      const reqs = await db
        .select({ id: documentRequests.id, engagementId: documentRequests.taxYearId, title: documentRequests.title, required: documentRequests.required, dueAt: documentRequests.dueAt, fulfilledAt: documentRequests.fulfilledAt })
        .from(documentRequests)
        .where(eq(documentRequests.clientId, clientId));
      for (const r of reqs) {
        const arr = requestsByEngagement[r.engagementId ?? "_none"] ?? [];
        arr.push({ id: r.id, title: r.title, required: r.required, dueAt: r.dueAt, fulfilledAt: r.fulfilledAt });
        requestsByEngagement[r.engagementId ?? "_none"] = arr;
      }

      const docs = await db
        .select({ id: documents.id, originalFilename: documents.originalFilename, reviewStatus: documents.reviewStatus, createdAt: documents.createdAt, taxYearId: documents.taxYearId })
        .from(documents)
        .where(and(eq(documents.clientId, clientId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt))
        .limit(50);
      // Bucket by taxYearId (not engagementId) — close enough for a header.
      for (const d of docs) {
        const k = d.taxYearId ?? "_none";
        const arr = docsByEngagement[k] ?? [];
        if (arr.length < 6) arr.push({ id: d.id, originalFilename: d.originalFilename, reviewStatus: d.reviewStatus, createdAt: d.createdAt });
        docsByEngagement[k] = arr;
      }
    }
  } catch {
    // best-effort
  }

  const totalProgress =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((s, r) => s + Math.min(100, Math.max(0, Number(r.progressPercent ?? 0))), 0) / rows.length);

  return (
    <DashboardShell audience="Client" title="Your tax work" description="Engagements your preparer is working on, with their current state and what's needed from you." nav={updatedNav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/engagements">
      {/* Top strip */}
      <section className="client-kpi-strip" aria-label="Engagement summary">
        <article className="client-kpi">
          <small>Active engagements</small>
          <strong>{rows.length}</strong>
          <p>{rows.length ? "Currently in motion." : "Nothing in motion."}</p>
        </article>
        <article className="client-kpi">
          <small>Average progress</small>
          <strong>{totalProgress}%</strong>
          <p>Across all engagements.</p>
        </article>
        <article className="client-kpi">
          <small>Open document requests</small>
          <strong>{counts.openRequests}</strong>
          <p>Your preparer is waiting on.</p>
        </article>
      </section>

      {rows.length === 0 ? (
        <section className="dashboard-empty">
          <h2>No engagements yet</h2>
          <p>Your preparer will create an engagement when your scope is confirmed.</p>
          <Link href="/dashboard/client" className="dashboard-button">Back to overview <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </section>
      ) : (
        rows.map((e) => {
          const egTaxYears = taxYearsRows.filter((ty) => returnsByEngagement[e.id]?.some((r) => r.id));
          const progress = Math.min(100, Math.max(0, Number(e.progressPercent ?? 0)));
          const rets = returnsByEngagement[e.id] ?? [];
          return (
            <section key={e.id} className="dashboard-section dashboard-engagement">
              <div className="dashboard-engagement-head">
                <div>
<span className="dashboard-eyebrow"><ClipboardList size={14} aria-hidden="true" /> {formatServiceType(e.serviceType)}</span>
                  <h2>{e.name}</h2>
                </div>
                <span className={`dashboard-eng-tag is-${e.status}`}>{ENGAGEMENT_STATUS[e.status] ?? e.status}</span>
              </div>

              <div className="dashboard-engagement-progress" role="img" aria-label={`${progress}% complete`}>
                <div className="dashboard-engagement-progress-bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <strong>{progress}%</strong>
                <span>Updated {relative(e.updatedAt)}</span>
              </div>

              <div className="dashboard-engagement-cols">
                <div>
                  <h3>Tax years</h3>
                  {egTaxYears.length === 0 ? (
                    <p className="dashboard-quiet">No tax years linked yet.</p>
                  ) : (
                    <ul className="dashboard-engagement-years">
                      {egTaxYears.map((ty) => (
                        <li key={ty.id}>
                          <strong>{ty.year}</strong>
                          <span>{RETURN_STATUS[ty.filingStatus] ?? ty.filingStatus}</span>
                          <span className="dashboard-muted">{ty.dueDate ? `Due ${dateOnly(ty.dueDate)}` : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3>Returns</h3>
                  {rets.length === 0 ? (
                    <p className="dashboard-quiet">No returns filed under this engagement yet.</p>
                  ) : (
                    <ul className="dashboard-engagement-returns">
                      {rets.map((r) => {
                        // Clients see only the simplified 6-step status, never
                        // internal pipeline stages. See lib/client-status.ts.
                        const display = clientFacingStatus(r.stage);
                        const tone =
                          display === "Completed" || display === "Filed"
                            ? "is-good"
                            : display === "Action Needed"
                              ? "is-bad"
                              : "is-pending";
                        return (
                          <li key={r.id}>
                            <span className={`dashboard-tag ${tone}`}>
                              {display}
                            </span>
                            <strong>{r.formType}</strong>
                            <span className="dashboard-muted">{r.filedAt ? `Filed ${dateOnly(r.filedAt)}` : r.preparedAt ? `Prepared ${dateOnly(r.preparedAt)}` : "—"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <h3>Documents needed</h3>
                  {(() => {
                    const allReqs = Object.values(requestsByEngagement).flat();
                    const openReqs = allReqs.filter((r) => !r.fulfilledAt);
                    if (openReqs.length === 0) {
                      return <p className="dashboard-quiet">No outstanding document requests.</p>;
                    }
                    return (
                      <ul className="dashboard-engagement-requests">
                        {openReqs.slice(0, 6).map((r) => (
                          <li key={r.id}>
                            <span className={`dashboard-tag ${r.required ? "is-bad" : "is-pending"}`}>{r.required ? "Required" : "Optional"}</span>
                            <strong>{r.title}</strong>
                            <span className="dashboard-muted">{r.dueAt ? `Due ${dateOnly(r.dueAt)}` : "—"}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>

              <div className="dashboard-engagement-foot">
                <Link href="/dashboard/client/documents" className="dashboard-button dashboard-button-secondary">
                  Open documents <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                <OpenChatButton className="dashboard-button dashboard-button-secondary">
                  Send a message <ArrowUpRight size={14} aria-hidden="true" />
                </OpenChatButton>
              </div>
            </section>
          );
        })
      )}

      {/* DOCUMENTS ON FILE FOR THIS CLIENT */}
      <section className="dashboard-section" aria-labelledby="docs-on-file">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow"><FileText size={14} aria-hidden="true" /> ON FILE</span>
          <h2 id="docs-on-file">Documents on file</h2>
        </div>
        {Object.keys(docsByEngagement).filter(k => k !== "_none" && docsByEngagement[k].length > 0).length === 0 ? (
          <div className="dashboard-empty">
            <h3>No documents on file yet</h3>
            <p>Once your preparer uploads something, it will appear here with review status.</p>
          </div>
        ) : (
          <div className="dashboard-table">
            <table>
              <thead>
                <tr><th>File</th><th>Status</th><th>Received</th></tr>
              </thead>
              <tbody>
                {Object.entries(docsByEngagement)
                  .filter(([k]) => k !== "_none")
                  .flatMap(([yearId, docs]) =>
                    docs.map((d) => (
                      <tr key={d.id + yearId}>
                        <td><b>{d.originalFilename}</b></td>
                        <td>
                          <span className={`dashboard-tag ${d.reviewStatus === "approved" ? "is-good" : d.reviewStatus === "rejected" ? "is-bad" : "is-pending"}`}>
                            {REVIEW_STATUS[d.reviewStatus] ?? d.reviewStatus}
                          </span>
                        </td>
                        <td className="dashboard-muted">{relative(d.createdAt)}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* NEXT STEPS */}
      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">GET STARTED</span>
          <h2>Your next steps</h2>
        </div>
        <ol className="dashboard-steps">
          <li>
            <span>01</span>
            <div><strong>Tell us what you need</strong><p>Request a consultation for individual filing, business taxes, or planning.</p></div>
            <button type="button" className="dashboard-button" data-open-appointment-request aria-label="Request an appointment">Request an appointment <ArrowUpRight size={16} aria-hidden="true" /></button>
          </li>
          <li>
            <span>02</span>
            <div><strong>Prepare for the conversation</strong><p>Review the general checklist before your appointment.</p></div>
            <Link href="/dashboard/client/documents" aria-label="View preparation checklist"><ArrowUpRight size={20} /></Link>
          </li>
          <li>
            <span>03</span>
            <div><strong>Send what your preparer asks for</strong><p>Any open requests show up under Documents. Use that page to share them.</p></div>
            <Link href="/dashboard/client/documents" aria-label="Open documents"><ArrowUpRight size={20} /></Link>
          </li>
        </ol>
      </section>
    </DashboardShell>
  );
}