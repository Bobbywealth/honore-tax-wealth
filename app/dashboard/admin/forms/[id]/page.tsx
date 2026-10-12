import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import DashboardShell from "../../../DashboardShell";
import { loadAdminNavCounts } from "../../lib/nav-counts";
import { navForRole } from "../../_lib/nav";
import { checkAdminAccess } from "../../auth";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { clients, signableDocuments, signatures, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { TEMPLATES } from "@/lib/signature-templates";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function statusBadge(status: string) {
  if (status === "signed") return <span className="adm-badge" style={{ background: "#d8efd4", color: "#2f6b3a" }}><CheckCircle2 size={11} aria-hidden="true" /> Signed</span>;
  if (status === "cancelled") return <span className="adm-badge" style={{ background: "#f6d8d6", color: "#7a2a25" }}><XCircle size={11} aria-hidden="true" /> Cancelled</span>;
  return <span className="adm-badge" style={{ background: "#fbe9c2", color: "#7a5b1c" }}><Clock size={11} aria-hidden="true" /> Pending</span>;
}

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await checkAdminAccess(await params);
  if (!access.allowed) return access.restricted;
  const me = await currentUser();
  const isAdmin = me?.role === "admin";
  const counts = await loadAdminNavCounts();
  const nav = navForRole(me?.role, counts);
  const { id } = await params;

  let doc: {
    id: string;
    title: string;
    body: string;
    kind: string;
    status: string;
    clientId: string;
    clientName: string | null;
    requiredSigners: number;
    preparedByEmail: string | null;
    createdAt: Date;
    signedAt: Date | null;
    taxYear: number | null;
  } | null = null;
  let sigs: Array<{
    id: string;
    signerName: string;
    signerEmail: string | null;
    signerRole: string | null;
    signatureType: string;
    signatureData: string;
    signedAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    const [row] = await db
      .select({
        id: signableDocuments.id,
        title: signableDocuments.title,
        body: signableDocuments.body,
        kind: signableDocuments.kind,
        status: signableDocuments.status,
        clientId: signableDocuments.clientId,
        requiredSigners: signableDocuments.requiredSigners,
        createdAt: signableDocuments.createdAt,
        signedAt: signableDocuments.signedAt,
        taxYear: signableDocuments.taxYear,
        clientName: clients.displayName,
        preparedByEmail: users.email,
      })
      .from(signableDocuments)
      .leftJoin(clients, eq(clients.id, signableDocuments.clientId))
      .leftJoin(users, eq(users.id, signableDocuments.preparedById))
      .where(eq(signableDocuments.id, id))
      .limit(1);
    doc = row ?? null;

    if (doc) {
      sigs = await db
        .select({
          id: signatures.id,
          signerName: signatures.signerName,
          signerEmail: signatures.signerEmail,
          signerRole: signatures.signerRole,
          signatureType: signatures.signatureType,
          signatureData: signatures.signatureData,
          signedAt: signatures.signedAt,
          ipAddress: signatures.ipAddress,
          userAgent: signatures.userAgent,
        })
        .from(signatures)
        .where(eq(signatures.documentId, id))
        .orderBy(desc(signatures.signedAt));
    }
  } catch {
    unavailable = true;
  }

  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/forms" audience="Admin" title={doc?.title ?? "Form"} description="Form detail and signature audit trail.">
      <div className="adm-page-h">
        <div>
          <Link href="/dashboard/admin/forms" className="adm-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={12} /> Back to forms
          </Link>
          <h1 style={{ marginTop: 6 }}>{doc?.title ?? "Form"}</h1>
          <div className="sub" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {doc ? statusBadge(doc.status) : null}
            {doc ? <span>{TEMPLATES[doc.kind as keyof typeof TEMPLATES]?.label ?? doc.kind}</span> : null}
            {doc?.clientName ? <Link href={`/dashboard/admin/clients/${doc.clientId}`}>{doc.clientName}</Link> : null}
          </div>
        </div>
        {doc && doc.status === "pending" ? (
          <form action={`/api/admin/forms/${doc.id}`} method="post">
            <button type="submit" className="adm-btn adm-btn-ghost" style={{ background: "#f6d8d6", color: "#7a2a25", boxShadow: "none", border: "1px solid #a63b37" }}>Cancel form</button>
          </form>
        ) : null}
      </div>

      {unavailable || !doc ? (
        <div className="adm-empty"><p>{unavailable ? "Could not load the form." : "Form not found."}</p></div>
      ) : (
        <>
          <div className="adm-card" style={{ padding: 22, marginBottom: 16, background: "#fff", border: "1px solid #d6dce1", borderRadius: 14 }}>
            <div className="adm-sm" style={{ color: "#7a858e", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, fontSize: 10 }}>Form body</div>
            <pre style={{ whiteSpace: "pre-wrap", font: "400 14px/1.55 'DM Sans',sans-serif", color: "#0e1a26", marginTop: 8 }}>{doc.body}</pre>
            <div className="adm-sm" style={{ marginTop: 14, color: "#5b6a78" }}>
              Prepared by {doc.preparedByEmail ?? "—"} · Created {fmtDate(doc.createdAt)} · {doc.requiredSigners} signature{doc.requiredSigners === 1 ? "" : "s"} required
              {doc.signedAt ? <> · All signatures captured {fmtDate(doc.signedAt)}</> : null}
            </div>
          </div>

          <div className="adm-section">
            <h2>Signatures captured ({sigs.length} / {doc.requiredSigners})</h2>
            {sigs.length === 0 ? (
              <div className="adm-empty"><p>No signatures yet. The form is pending — the client can sign at <code>/dashboard/client/forms/{doc.id}</code>.</p></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {sigs.map((s) => (
                  <div key={s.id} className="adm-card" style={{ padding: 18, background: "#fff", border: "1px solid #d6dce1", borderRadius: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 18, background: "#d4a755", color: "#0a1828", display: "grid", placeItems: "center", font: "700 14px 'DM Sans',sans-serif" }}>
                        {s.signerName.split(" ").map((w) => w[0]?.toUpperCase()).slice(0, 2).join("") || "?"}
                      </div>
                      <div>
                        <div style={{ font: "600 14px 'DM Sans',sans-serif" }}>{s.signerName}</div>
                        <div className="adm-sm" style={{ color: "#5b6a78" }}>{s.signerRole ?? "Signer"} · {fmtDate(s.signedAt)}</div>
                      </div>
                    </div>
                    {s.signatureType === "drawn" && s.signatureData.startsWith("data:image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.signatureData} alt={`${s.signerName} signature`} style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain", background: "#faf9f5", borderRadius: 8, padding: 4 }} />
                    ) : (
                      <div style={{ font: "italic 22px 'Georgia',serif", color: "#0a1828", padding: 8, background: "#faf9f5", borderRadius: 8 }}>{s.signatureData}</div>
                    )}
                    <div className="adm-sm" style={{ marginTop: 10, color: "#5b6a78", fontSize: 11 }}>
                      IP {s.ipAddress ?? "—"} · {s.userAgent ? s.userAgent.slice(0, 80) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="adm-section" style={{ marginTop: 18 }}>
            <h2>Share with client</h2>
            <p className="adm-sm" style={{ color: "#5b6a78", marginBottom: 10 }}>
              Direct link the client can open from any signed-in session on the portal:
            </p>
            <code style={{ display: "inline-block", padding: "6px 10px", background: "#faf9f5", border: "1px solid #d6dce1", borderRadius: 8, font: "500 12px ui-monospace,monospace" }}>
              https://honore-tax-wealth.onrender.com/dashboard/client/forms/{doc.id}
            </code>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
