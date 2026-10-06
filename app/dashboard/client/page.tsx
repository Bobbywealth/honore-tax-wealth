import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquareText,
  Receipt,
} from "lucide-react";
import DashboardShell, { type PortalNavItem } from "../DashboardShell";
import { primaryClientFor, clientSnapshot } from "@/lib/access";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

/** Wording for a staff-set engagement status. Never implies filing status. */
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
  pending: "Awaiting review",
  approved: "Reviewed",
  rejected: "Needs attention",
  superseded: "Replaced",
};

function formatDate(value: Date | null, timeZone = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function ClientDashboard() {
  const { requireUser } = await import("@/lib/access");
  const user = await requireUser();
  if (!user) redirect("/login?next=/dashboard/client");

  const nav: PortalNavItem[] = [
    { href: "#overview", label: "Overview" },
    { href: "#engagements", label: "Your tax work" },
    { href: "#documents", label: "Documents" },
    { href: "#appointments", label: "Appointments" },
    { href: "#next-steps", label: "Next steps" },
  ];

  const clientId = await primaryClientFor(user);

  // Signed in, but no client record is linked to this account yet. That is a
  // real state, not an error, so it gets a real explanation.
  if (!clientId) {
    return (
      <DashboardShell
        audience="Client"
        title="Your tax home"
        description="A clear place to see what comes next in your tax preparation."
        nav={nav}
        userLabel={user.displayName ?? user.email}
      >
        <div className="dashboard-alert">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p>
            <strong>Your account is ready, but it is not linked to a client record yet.</strong> Your
            preparer will connect it. If you have just requested a consultation, no further action is
            needed from you.
          </p>
        </div>
      </DashboardShell>
    );
  }

  let snapshot: Awaited<ReturnType<typeof clientSnapshot>> | null = null;
  let unavailable = false;
  try {
    await ensureMigrated();
    snapshot = await clientSnapshot(clientId);
  } catch {
    unavailable = true;
  }

  const openRequests = snapshot?.openDocumentRequests ?? [];
  const openTasks = snapshot?.tasks ?? [];
  const hasWork = (snapshot?.engagements.length ?? 0) > 0;

  return (
    <DashboardShell
      audience="Client"
      title="Your tax home"
      description="Everything below is your own record. Progress shown here is set by your preparer and is not a filing confirmation."
      nav={nav}
      userLabel={user.displayName ?? user.email}
    >
      {unavailable ? (
        <div className="dashboard-alert">
          <p>
            <strong>We could not load your account just now.</strong> Please refresh, or contact the
            team if it keeps happening. Nothing has been lost.
          </p>
        </div>
      ) : null}

      {/* ---------------------------- Overview ---------------------------- */}
      <div className="client-summary" aria-label="Account overview">
        <article>
          <small>Active engagements</small>
          <strong>{snapshot?.engagements.length ?? 0}</strong>
          <p>{hasWork ? "Your current tax work." : "Nothing in progress yet."}</p>
        </article>
        <article>
          <small>Documents to send</small>
          <strong>{openRequests.length}</strong>
          <p>{openRequests.length ? "Requested by your preparer." : "Nothing outstanding."}</p>
        </article>
        <article>
          <small>Upcoming appointments</small>
          <strong>{snapshot?.appointments.length ?? 0}</strong>
          <p>{snapshot?.appointments.length ? "Confirmed or awaiting confirmation." : "None scheduled."}</p>
        </article>
      </div>

      {/* --------------------------- Engagements -------------------------- */}
      <section className="dashboard-section dashboard-primary" id="engagements">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">YOUR TAX WORK</span>
          <h2>Engagements</h2>
        </div>

        {!hasWork ? (
          <p className="dashboard-quiet">
            You do not have any tax work in progress. If you have requested a consultation, your
            preparer will confirm scope before anything begins.
          </p>
        ) : (
          <div className="dashboard-status-list">
            {snapshot!.engagements.map((e) => (
              <div className="dashboard-status-row" key={e.id}>
                <FileText size={20} aria-hidden="true" />
                <div>
                  <strong>{e.name}</strong>
                  <span>
                    {e.serviceType} &middot; {ENGAGEMENT_STATUS[e.status] ?? e.status}
                  </span>
                </div>
                <span className="dashboard-muted">Updated {formatDate(e.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {snapshot && snapshot.taxYears.length > 0 ? (
          <>
            <h3>Tax years</h3>
            <div className="dashboard-status-list">
              {snapshot.taxYears.map((ty) => (
                <div className="dashboard-status-row" key={ty.id}>
                  <div>
                    <strong>{ty.year} tax year</strong>
                    <span>{RETURN_STATUS[ty.filingStatus] ?? ty.filingStatus}</span>
                  </div>
                  {ty.dueDate ? (
                    <span className="dashboard-muted">Due {formatDate(ty.dueDate)}</span>
                  ) : null}
                  {ty.externalConfirmationRef ? (
                    // Only ever rendered from a real integration reference.
                    <span className="dashboard-muted">Confirmed by filing provider</span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {/* ---------------------------- Documents --------------------------- */}
      <section className="dashboard-section" id="documents">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">DOCUMENTS</span>
          <h2>What we need, and what you have</h2>
        </div>

        <h3>Requested from you</h3>
        {openRequests.length === 0 ? (
          <p className="dashboard-quiet">Nothing is outstanding right now.</p>
        ) : (
          <ul className="dashboard-list">
            {openRequests.map((r) => (
              <li key={r.id}>
                <strong>
                  {r.title}
                  {r.required ? "" : " (optional)"}
                </strong>
                {r.description ? <span>{r.description}</span> : null}
                {r.dueAt ? <span className="dashboard-muted">Requested by {formatDate(r.dueAt)}</span> : null}
              </li>
            ))}
          </ul>
        )}

        <h3>On file</h3>
        {!snapshot || snapshot.documents.length === 0 ? (
          <p className="dashboard-quiet">No documents have been uploaded yet.</p>
        ) : (
          <div className="dashboard-status-list">
            {snapshot.documents.map((d) => (
              <div className="dashboard-status-row" key={d.id}>
                <div>
                  <strong>{d.originalFilename}</strong>
                  <span>{REVIEW_STATUS[d.reviewStatus] ?? d.reviewStatus}</span>
                </div>
                <span className="dashboard-muted">Added {formatDate(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="dashboard-alert">
          <p>
            <strong>Do not email tax documents.</strong> Secure upload is not yet available, so your
            preparer will give you a private method for sending anything sensitive.
          </p>
        </div>
      </section>

      {/* --------------------------- Appointments ------------------------- */}
      <section className="dashboard-section" id="appointments">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">APPOINTMENTS</span>
          <h2>Scheduled</h2>
        </div>

        {!snapshot || snapshot.appointments.length === 0 ? (
          <p className="dashboard-quiet">
            You have no upcoming appointments. Request a consultation and the team will confirm a
            time with you.
          </p>
        ) : (
          <div className="dashboard-status-list">
            {snapshot.appointments.map((a) => (
              <div className="dashboard-status-row" key={a.id}>
                <CalendarDays size={20} aria-hidden="true" />
                <div>
                  <strong>{a.title}</strong>
                  <span>
                    {a.status === "requested" ? "Requested — awaiting confirmation" : "Confirmed"}
                  </span>
                </div>
                {/* Rendered in the appointment's own timezone, so a DST change
                    cannot shift what the client sees. */}
                <span className="dashboard-muted">{formatDate(a.startsAt, a.timezone)}</span>
              </div>
            ))}
          </div>
        )}

        {snapshot && snapshot.invoices.length > 0 ? (
          <>
            <h3>Invoices</h3>
            <div className="dashboard-status-list">
              {snapshot.invoices.map((inv) => (
                <div className="dashboard-status-row" key={inv.id}>
                  <Receipt size={20} aria-hidden="true" />
                  <div>
                    <strong>{inv.number}</strong>
                    <span>{inv.status}</span>
                  </div>
                  <span className="dashboard-muted">
                    ${inv.total}
                    {inv.dueAt && inv.status !== "paid" ? ` — due ${formatDate(inv.dueAt)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {/* ---------------------------- Next steps -------------------------- */}
      <section className="dashboard-section" id="next-steps">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">GET STARTED</span>
          <h2>Your next steps</h2>
        </div>
        <ol className="dashboard-steps">
          <li>
            <span>01</span>
            <div>
              <strong>Tell us what you need</strong>
              <p>Request a consultation for individual filing, business taxes, or planning.</p>
            </div>
            <a href="/#contact" aria-label="Request a consultation">
              <ArrowUpRight size={20} />
            </a>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Prepare for the conversation</strong>
              <p>Review the general checklist before your appointment.</p>
            </div>
            <a href="/#prepare" aria-label="View preparation checklist">
              <ArrowUpRight size={20} />
            </a>
          </li>
          {openTasks.length > 0 ? (
            <li>
              <span>03</span>
              <div>
                <strong>Open tasks</strong>
                <p>
                  {openTasks.map((t) => t.title).join(", ")}
                </p>
              </div>
            </li>
          ) : (
            <li>
              <span>03</span>
              <div>
                <strong>Share documents securely</strong>
                <p>Your preparer will provide instructions when secure document access is available.</p>
              </div>
            </li>
          )}
        </ol>
        <a className="dashboard-button" href="/#contact">
          Request a consultation <ArrowUpRight size={18} />
        </a>
      </section>

      <section className="dashboard-section client-checklist" aria-labelledby="checklist-title">
        <span className="dashboard-eyebrow">MESSAGES</span>
        <h2 id="checklist-title">Secure messaging</h2>
        <p className="dashboard-quiet">
          <MessageSquareText size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
          Portal messaging is not yet available. Use the consultation form or contact your preparer
          directly for now.
        </p>
        <a className="dashboard-button" href="/#prepare">
          View the preparation guide <ArrowUpRight size={18} />
        </a>
      </section>
    </DashboardShell>
  );
}