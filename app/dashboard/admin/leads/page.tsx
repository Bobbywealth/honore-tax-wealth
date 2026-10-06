import { Globe, Plus } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

/** Pipeline stages, in the order they progress. */
const STAGES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "consultation_scheduled", label: "Consultation scheduled" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

function formatDate(value: Date | null): string {
  if (!value) return "No follow-up set";
  const now = new Date();
  const target = new Date(value);
  const sameDay = target.toDateString() === now.toDateString();
  return sameDay
    ? `Today ${new Intl.DateTimeFormat("en-US", {
        timeStyle: "short",
        timeZone: "America/New_York",
      }).format(target)}`
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(
        target,
      );
}

export default async function LeadsPage() {
  const access = await checkAdminAccess();
  if (!access.allowed) return access.restricted;

  let rows: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    service: string | null;
    source: string;
    stage: string;
    followUpAt: Date | null;
    notes: string | null;
    createdAt: Date;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    rows = await getDb()
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        service: leads.service,
        source: leads.source,
        stage: leads.stage,
        followUpAt: leads.followUpAt,
        notes: leads.notes,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .orderBy(asc(leads.followUpAt), desc(leads.createdAt))
      .limit(300);
  } catch {
    unavailable = true;
  }

  const byStage = new Map<string, typeof rows>();
  for (const stage of STAGES) byStage.set(stage.key, []);
  for (const row of rows) {
    const bucket = byStage.get(row.stage);
    if (bucket) bucket.push(row);
    else byStage.get("new")!.push(row);
  }

  const total = rows.length;

  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/leads">
      <div className="adm-page-h">
        <div>
          <h1>Leads</h1>
          {/* Real counts only. No invented pipeline values. */}
          <div className="sub">{unavailable ? "Unavailable" : `${total} lead${total === 1 ? "" : "s"} in the pipeline`}</div>
        </div>
        <button className="adm-btn" disabled title="Add lead">
          <Plus size={13} /> New lead
        </button>
      </div>

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load leads. Nothing has been lost — try again shortly.</p>
        </div>
      ) : total === 0 ? (
        <div className="adm-empty">
          <Globe size={22} aria-hidden="true" />
          <h2>No leads yet</h2>
          <p>Consultation requests from the public form are the first step. Leads appear here as they are qualified.</p>
        </div>
      ) : (
        <div className="adm-board">
          {STAGES.map((stage) => {
            const items = byStage.get(stage.key) ?? [];
            return (
              <section key={stage.key} className="adm-col">
                <header className="adm-col-h">
                  <span>{stage.label}</span>
                  <span className="adm-count">{items.length}</span>
                </header>
                {items.length === 0 ? (
                  <p className="adm-col-empty">None</p>
                ) : (
                  items.map((lead) => (
                    <article key={lead.id} className="adm-card">
                      <strong>{lead.name}</strong>
                      <a href={`mailto:${lead.email}`} className="adm-card-sub">
                        {lead.email}
                      </a>
                      {lead.service ? <span className="adm-tag">{lead.service}</span> : null}
                      <span className="adm-card-meta">Source: {lead.source}</span>
                      <span className="adm-card-meta">Follow up: {formatDate(lead.followUpAt)}</span>
                      {lead.notes ? <p className="adm-card-note">{lead.notes}</p> : null}
                    </article>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}