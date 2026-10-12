import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { CheckCircle2, ClipboardList, Clock } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { getDb } from "@/db";
import { signableDocuments, signatures } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { authorizedClientIds } from "@/lib/access";
import { TEMPLATES } from "@/lib/signature-templates";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(value));
}

export default async function ClientFormsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/forms");

  // Surface count badge on the sidebar — pending forms across all
  // authorized clients.
  const clientIds = await authorizedClientIds(user);
  const counts = {
    openRequests: 0,
    unpaidInvoices: 0,
    unreadMessages: 0,
    upcomingAppointments: 0,
    activeEngagements: 0,
    pendingSignatures: 0,
  };

  let rows: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    body: string;
    createdAt: Date;
    dueAt: Date | null;
    signedAt: Date | null;
    signaturesCount: number;
    requiredSigners: number;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    if (clientIds.length > 0) {
      const docs = await db
        .select({
          id: signableDocuments.id,
          title: signableDocuments.title,
          kind: signableDocuments.kind,
          status: signableDocuments.status,
          body: signableDocuments.body,
          createdAt: signableDocuments.createdAt,
          dueAt: signableDocuments.dueAt,
          signedAt: signableDocuments.signedAt,
          requiredSigners: signableDocuments.requiredSigners,
        })
        .from(signableDocuments)
        .where(inArray(signableDocuments.clientId, clientIds))
        .orderBy(desc(signableDocuments.createdAt))
        .limit(100);

      const ids = docs.map((d) => d.id);
      let sigMap = new Map<string, number>();
      if (ids.length > 0) {
        const sigs = await db
          .select({ documentId: signatures.documentId, n: sql<number>`count(*)::int` })
          .from(signatures)
          .where(inArray(signatures.documentId, ids))
          .groupBy(signatures.documentId);
        for (const s of sigs) sigMap.set(s.documentId, Number(s.n));
      }
      rows = docs.map((r) => ({ ...r, signaturesCount: sigMap.get(r.id) ?? 0 }));
      counts.pendingSignatures = rows.filter((r) => r.status === "pending").length;
    }
  } catch {
    unavailable = true;
  }

  return (
    <DashboardShell nav={clientNav(counts)} currentHref="/dashboard/client/forms" audience="Client" title="Forms to sign" description="Tax returns, engagement letters, and consent forms that need your signature.">
      <div className="adm-page-h">
        <div>
          <h1>Forms to sign</h1>
          <div className="sub">{unavailable ? "Unavailable" : `${rows.filter((r) => r.status === "pending").length} pending · ${rows.filter((r) => r.status === "signed").length} signed`}</div>
        </div>
      </div>

      {unavailable ? (
        <div className="dashboard-alert"><p>Could not load forms.</p></div>
      ) : rows.length === 0 ? (
        <div className="dashboard-empty">
          <ClipboardList size={22} aria-hidden="true" />
          <h3>No forms yet</h3>
          <p>When the practice sends a 1040, engagement letter, or consent form, it shows up here.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {rows.map((r) => {
            const tpl = TEMPLATES[r.kind as keyof typeof TEMPLATES];
            const isPending = r.status === "pending";
            return (
              <Link key={r.id} href={`/dashboard/client/forms/${r.id}`} className="dashboard-card" style={{ textDecoration: "none", color: "inherit", padding: 18, background: "#fff", border: "1px solid #d6dce1", borderRadius: 14, display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div className="dashboard-eyebrow">{tpl?.label ?? r.kind}</div>
                    <div style={{ font: "700 17px Fraunces,Georgia,serif", letterSpacing: "-.3px", color: "#0a1828", marginTop: 4 }}>{r.title}</div>
                  </div>
                  {isPending ? (
                    <span className="adm-badge" style={{ background: "#fbe9c2", color: "#7a5b1c" }}><Clock size={11} aria-hidden="true" /> Pending</span>
                  ) : (
                    <span className="adm-badge" style={{ background: "#d8efd4", color: "#2f6b3a" }}><CheckCircle2 size={11} aria-hidden="true" /> Signed</span>
                  )}
                </div>
                <div className="dashboard-sm" style={{ marginTop: 8, color: "#5b6a78" }}>
                  {r.signaturesCount} of {r.requiredSigners} signatures · {fmtDate(r.createdAt)}
                </div>
                {r.dueAt ? (
                  <div className="dashboard-sm" style={{ marginTop: 4, color: "#7a5b1c" }}>Due {fmtDate(r.dueAt)}</div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
