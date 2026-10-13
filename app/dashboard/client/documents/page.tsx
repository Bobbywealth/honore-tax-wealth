import { redirect } from "next/navigation";
import { ArrowUpRight, FileText, Upload, CheckCircle2, AlertTriangle, FileQuestion } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import OpenChatButton from "../_components/OpenChatButton";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { documents, documentRequests } from "@/db/schema";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

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
    const schema = await import("@/db/schema");
    const [eg, req, appt, inv] = await Promise.all([
      db.select({ c: count() }).from(schema.engagements).where(and(eq(schema.engagements.clientId, clientId), isNull(schema.engagements.archivedAt))),
      db.select({ c: count() }).from(schema.documentRequests).where(and(eq(schema.documentRequests.clientId, clientId), isNull(schema.documentRequests.fulfilledAt))),
      db.select({ c: count() }).from(schema.appointments).where(and(eq(schema.appointments.clientId, clientId), sql`${schema.appointments.status} IN ('requested','confirmed')`)),
      db.select({ c: count() }).from(schema.invoices).where(and(eq(schema.invoices.clientId, clientId), sql`${schema.invoices.status} IN ('sent','overdue')`)),
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

export default async function ClientDocumentsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/documents");
  const clientId = await primaryClientFor(user);
  const nav = clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 });

  if (!clientId) {
    return (
      <DashboardShell audience="Client" title="Documents" description="" nav={nav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/documents">
        <div className="dashboard-alert">
          <p><strong>No client record linked.</strong> Ask your preparer to connect your account.</p>
        </div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const nav2 = clientNav(counts);

  let openRequests: Array<{ id: string; title: string; description: string | null; required: boolean; dueAt: Date | null }> = [];
  let fulfilledRequests: Array<{ id: string; title: string; fulfilledAt: Date | null }> = [];
  let onFile: Array<{ id: string; originalFilename: string; contentType: string; sizeBytes: number; category: string; reviewStatus: string; createdAt: Date }> = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      openRequests = await db
        .select({ id: documentRequests.id, title: documentRequests.title, description: documentRequests.description, required: documentRequests.required, dueAt: documentRequests.dueAt })
        .from(documentRequests)
        .where(and(eq(documentRequests.clientId, clientId), isNull(documentRequests.fulfilledAt)))
        .orderBy(asc(documentRequests.dueAt));

      fulfilledRequests = await db
        .select({ id: documentRequests.id, title: documentRequests.title, fulfilledAt: documentRequests.fulfilledAt })
        .from(documentRequests)
        .where(and(eq(documentRequests.clientId, clientId), sql`${documentRequests.fulfilledAt} is not null`))
        .orderBy(desc(documentRequests.createdAt))
        .limit(10);

      onFile = await db
        .select({ id: documents.id, originalFilename: documents.originalFilename, contentType: documents.contentType, sizeBytes: documents.sizeBytes, category: documents.category, reviewStatus: documents.reviewStatus, createdAt: documents.createdAt })
        .from(documents)
        .where(and(eq(documents.clientId, clientId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt))
        .limit(40);
    }
  } catch {
    // best-effort
  }

  const totalSize = onFile.reduce((s, k) => s + Number(k.sizeBytes ?? 0), 0);

  return (
    <DashboardShell audience="Client" title="Documents" description="What your preparer needs from you, and everything they've shared with you on file." nav={nav2} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/documents">

      <section className="client-kpi-strip" aria-label="Documents summary">
        <article className={`client-kpi${counts.openRequests ? " is-alert" : ""}`}>
          <small>Open requests</small>
          <strong>{counts.openRequests}</strong>
          <p>{counts.openRequests ? "Your preparer is waiting on these." : "Nothing outstanding."}</p>
        </article>
        <article className="client-kpi">
          <small>On file</small>
          <strong>{onFile.length}</strong>
          <p>Total documents received.</p>
        </article>
        <article className="client-kpi">
          <small>Storage used</small>
          <strong>{(totalSize / 1024 / 1024).toFixed(1)} MB</strong>
          <p>Across all on-file documents.</p>
        </article>
        <article className="client-kpi">
          <small>Fulfilled requests</small>
          <strong>{fulfilledRequests.length}</strong>
          <p>Already completed and archived.</p>
        </article>
      </section>

      {/* REQUESTED FROM YOU */}
      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow"><FileQuestion size={28} aria-hidden="true" /> REQUESTED FROM YOU</span>
          <h2>Your preparer is waiting on</h2>
        </div>

        {openRequests.length === 0 ? (
          <div className="dashboard-empty">
            <CheckCircle2 size={22} aria-hidden="true" />
            <h3>You are caught up</h3>
            <p>Nothing outstanding. Your preparer will reach out when something new is needed.</p>
          </div>
        ) : (
          <ul className="dashboard-request-list">
            {openRequests.map((r) => {
              const overdue = r.dueAt && new Date(r.dueAt).getTime() < Date.now();
              return (
                <li key={r.id} className={`dashboard-request-i${overdue ? " is-overdue" : ""}`}>
                  <div className="dashboard-request-row1">
                    <span className={`dashboard-tag ${overdue ? "is-bad" : r.required ? "is-bad" : "is-pending"}`}>
                      {overdue ? "Overdue" : r.required ? "Required" : "Optional"}
                    </span>
                    <strong>{r.title}</strong>
                  </div>
                  {r.description ? <p className="dashboard-quiet">{r.description}</p> : null}
                  <div className="dashboard-request-row2">
                    {r.dueAt ? <span className="dashboard-muted">Requested by {dateOnly(r.dueAt)}</span> : <span className="dashboard-muted">No due date set</span>}
                    <form action="/api/client/document-requests/fulfill" method="post" className="dashboard-request-form">
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="dashboard-button dashboard-button-secondary">
                        <CheckCircle2 size={14} aria-hidden="true" /> Mark uploaded
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="dashboard-alert">
          <p><strong>Do not email tax documents.</strong> Secure upload is not yet available, so your preparer will give you a private method for sending anything sensitive.</p>
        </div>
      </section>

      {/* ON FILE */}
      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow"><FileText size={28} aria-hidden="true" /> ON FILE</span>
          <h2>Documents received from your preparer</h2>
          <p className="dashboard-quiet">Each file shows the preparer's review status. Approved items have been signed off.</p>
        </div>

        {onFile.length === 0 ? (
          <div className="dashboard-empty">
            <h3>No documents yet</h3>
            <p>When your preparer sends you a copy of a return, statement, or signed form, it will appear here.</p>
          </div>
        ) : (
          <div className="dashboard-table">
            <table>
              <thead>
                <tr><th>File</th><th>Type</th><th>Status</th><th>Size</th><th>Received</th></tr>
              </thead>
              <tbody>
                {onFile.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.originalFilename}</b></td>
                    <td className="dashboard-muted">{d.contentType}</td>
                    <td>
                      <span className={`dashboard-tag ${d.reviewStatus === "approved" ? "is-good" : d.reviewStatus === "rejected" ? "is-bad" : "is-pending"}`}>
                        {REVIEW_STATUS[d.reviewStatus] ?? d.reviewStatus}
                      </span>
                    </td>
                    <td className="dashboard-muted">{d.sizeBytes ? `${(Number(d.sizeBytes) / 1024).toFixed(0)} KB` : "—"}</td>
                    <td className="dashboard-muted">{relative(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RECENTLY FULFILLED */}
      {fulfilledRequests.length > 0 ? (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <span className="dashboard-eyebrow">RECENTLY FULFILLED</span>
            <h2>Past requests</h2>
          </div>
          <ul className="dashboard-archive-list">
            {fulfilledRequests.map((r) => (
              <li key={r.id}>
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>{r.title}</span>
                <span className="dashboard-muted">{r.fulfilledAt ? `Marked complete ${dateOnly(r.fulfilledAt)}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ACTION */}
      <section className="dashboard-section client-checklist">
        <span className="dashboard-eyebrow"><Upload size={14} aria-hidden="true" /> NEXT STEP</span>
        <h2>Need a refresher?</h2>
        <p className="dashboard-quiet">Send your preparer a quick note in the messages tab if anything is missing or unclear.</p>
        <OpenChatButton className="dashboard-button">
          Open messages <ArrowUpRight size={16} aria-hidden="true" />
        </OpenChatButton>
      </section>
    </DashboardShell>
  );
}