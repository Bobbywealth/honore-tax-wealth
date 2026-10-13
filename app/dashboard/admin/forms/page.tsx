import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { ClipboardList, Plus } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { navForRole } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { clients, signableDocuments, signatures } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { TEMPLATES } from "@/lib/signature-templates";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  pending: "adm-badge adm-badge-pending",
  signed: "adm-badge adm-badge-signed",
  cancelled: "adm-badge adm-badge-cancelled",
};

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(value));
}

export default async function FormsListPage({ searchParams }: { searchParams?: Promise<{ created?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;
  const me = await currentUser();
  const isAdmin = me?.role === "admin";
  const counts = await loadAdminNavCounts();
  const nav = navForRole(me?.role, counts);

  const sp = (await searchParams) ?? {};
  const justCreated = sp.created ?? null;

  let rows: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    clientId: string;
    clientName: string | null;
    requiredSigners: number;
    createdAt: Date;
    signedAt: Date | null;
    signaturesCount: number;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    const base = await db
      .select({
        id: signableDocuments.id,
        title: signableDocuments.title,
        kind: signableDocuments.kind,
        status: signableDocuments.status,
        clientId: signableDocuments.clientId,
        requiredSigners: signableDocuments.requiredSigners,
        createdAt: signableDocuments.createdAt,
        signedAt: signableDocuments.signedAt,
        clientName: clients.displayName,
      })
      .from(signableDocuments)
      .leftJoin(clients, eq(clients.id, signableDocuments.clientId))
      // Agents see only their own clients
      .where(
        me?.role === "admin" || !me
          ? sql`true`
          : sql`exists (select 1 from engagements where engagements.client_id = ${signableDocuments.clientId} and engagements.owner_id = ${me.id})`,
      )
      .orderBy(desc(signableDocuments.createdAt))
      .limit(200);

    const ids = base.map((r) => r.id);
    let countsMap = new Map<string, number>();
    if (ids.length > 0) {
      const sigs = await db
        .select({ documentId: signatures.documentId, n: sql<number>`count(*)::int` })
        .from(signatures)
        .where(inArray(signatures.documentId, ids))
        .groupBy(signatures.documentId);
      for (const s of sigs) countsMap.set(s.documentId, Number(s.n));
    }
    rows = base.map((r) => ({ ...r, signaturesCount: countsMap.get(r.id) ?? 0 }));
  } catch {
    unavailable = true;
  }

  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/forms" audience="Admin" title="Signable forms" description="Send 1040s, engagement letters, and consent forms for the client's signature — right here in the portal.">
      <div className="adm-page-h">
        <div>
          <h1>Signable forms</h1>
          <div className="sub">{unavailable ? "Unavailable" : `${rows.length} ${rows.length === 1 ? "form" : "forms"}`}</div>
        </div>
        <Link href="/dashboard/admin/forms/new" className="adm-btn"><Plus size={14} aria-hidden="true" /> New form</Link>
      </div>

      {justCreated ? (
        <div className="adm-import-results" style={{ marginBottom: 14 }}>
          <h3>Form created. <Link href={`/dashboard/admin/forms/${justCreated}`}>Open it →</Link></h3>
        </div>
      ) : null}

      {unavailable ? (
        <div className="adm-empty"><p>We could not load forms. Nothing has been lost — try again shortly.</p></div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <ClipboardList size={22} aria-hidden="true" />
          <h2>No forms yet</h2>
          <p>Create a signable 1040, engagement letter, or consent disclosure to send to a client.</p>
          <Link href="/dashboard/admin/forms/new" className="adm-btn">+ New form</Link>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="sr-only">Signable forms</caption>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Signatures</th>
                <th>Created</th>
                <th>Signed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/dashboard/admin/forms/${r.id}`}>
                      <strong>{r.title}</strong>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/admin/clients/${r.clientId}`} className="adm-card-sub">{r.clientName ?? "—"}</Link>
                  </td>
                  <td><span className="adm-badge">{TEMPLATES[r.kind as keyof typeof TEMPLATES]?.label ?? r.kind}</span></td>
                  <td><span className={STATUS_BADGE[r.status] ?? "adm-badge"}>{r.status}</span></td>
                  <td>{r.signaturesCount} / {r.requiredSigners}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>{formatDate(r.signedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}

