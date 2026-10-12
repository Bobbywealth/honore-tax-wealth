import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import DashboardShell from "../../../DashboardShell";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../../_lib/nav";
import { getDb } from "@/db";
import { clients, signableDocuments, signatures } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { authorizedClientIds } from "@/lib/access";
import { ESIGN_CONSENT, TEMPLATES } from "@/lib/signature-templates";
import SignFormClient from "./sign-form-client";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}

export default async function ClientFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Counts (sidebar badge). The current page is for the user's own client
  // forms so we report totals across all authorized clients.
  const clientIds = await authorizedClientIds(user);
  const counts = {
    openRequests: 0,
    unpaidInvoices: 0,
    unreadMessages: 0,
    upcomingAppointments: 0,
    activeEngagements: 0,
    pendingSignatures: 0,
  };

  let doc: {
    id: string;
    title: string;
    body: string;
    kind: string;
    status: string;
    formData: Record<string, string>;
    requiredSigners: number;
    createdAt: Date;
    signedAt: Date | null;
    dueAt: Date | null;
    clientName: string | null;
  } | null = null;
  let sigs: Array<{
    id: string;
    signerName: string;
    signerRole: string | null;
    signatureType: string;
    signedAt: Date;
    signerId: string | null;
  }> = [];
  let unauthorized = false;
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();

    if (clientIds.length === 0) {
      unauthorized = true;
    } else {
      const [row] = await db
        .select({
          id: signableDocuments.id,
          title: signableDocuments.title,
          body: signableDocuments.body,
          kind: signableDocuments.kind,
          status: signableDocuments.status,
          formData: signableDocuments.formData,
          requiredSigners: signableDocuments.requiredSigners,
          createdAt: signableDocuments.createdAt,
          signedAt: signableDocuments.signedAt,
          dueAt: signableDocuments.dueAt,
          clientName: clients.displayName,
        })
        .from(signableDocuments)
        .leftJoin(clients, eq(clients.id, signableDocuments.clientId))
        .where(and(eq(signableDocuments.id, id), inArray(signableDocuments.clientId, clientIds)))
        .limit(1);
      // signable_documents.formData is jsonb; drizzle returns unknown.
      const coerced = row
        ? { ...row, formData: (row.formData as Record<string, string> | null) ?? {} }
        : null;
      doc = coerced;
      unauthorized = !doc;

      if (doc) {
        sigs = await db
          .select({
            id: signatures.id,
            signerName: signatures.signerName,
            signerRole: signatures.signerRole,
            signatureType: signatures.signatureType,
            signedAt: signatures.signedAt,
            signerId: signatures.signerId,
          })
          .from(signatures)
          .where(eq(signatures.documentId, id))
          .orderBy(desc(signatures.signedAt));
      }
    }
  } catch {
    unavailable = true;
  }

  const tpl = doc ? TEMPLATES[doc.kind as keyof typeof TEMPLATES] : null;
  const alreadySigned = sigs.some((s) => s.signerId === user.id);
  const isPending = doc?.status === "pending";
  const isCancelled = doc?.status === "cancelled";
  const isSigned = doc?.status === "signed";

  return (
    <DashboardShell nav={clientNav(counts)} currentHref="/dashboard/client/forms" audience="Client" title={doc?.title ?? "Form"} description="Read the document, sign with your mouse or finger, and you're done.">
      <div className="adm-page-h">
        <div>
          <Link href="/dashboard/client/forms" className="dashboard-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={12} /> Back to forms
          </Link>
          <h1 style={{ marginTop: 6 }}>{doc?.title ?? "Form"}</h1>
          <div className="sub" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isPending ? <span className="adm-badge" style={{ background: "#fbe9c2", color: "#7a5b1c" }}><Clock size={11} aria-hidden="true" /> Pending</span> : null}
            {isSigned ? <span className="adm-badge" style={{ background: "#d8efd4", color: "#2f6b3a" }}><CheckCircle2 size={11} aria-hidden="true" /> Signed</span> : null}
            {isCancelled ? <span className="adm-badge" style={{ background: "#f6d8d6", color: "#7a2a25" }}><XCircle size={11} aria-hidden="true" /> Cancelled</span> : null}
            {tpl ? <span>{tpl.label}</span> : null}
          </div>
        </div>
      </div>

      {unavailable || !doc ? (
        <div className="dashboard-alert"><p>{unavailable ? "You don't have access to this form." : unavailable ? "Could not load the form." : "Form not found."}</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          <section className="adm-card" style={{ padding: 22, background: "#fff", border: "1px solid #d6dce1", borderRadius: 14 }}>
            <div className="dashboard-eyebrow">Form body</div>
            <pre style={{ whiteSpace: "pre-wrap", font: "400 14px/1.55 'DM Sans',sans-serif", color: "#0e1a26", marginTop: 8, padding: 0 }}>{doc.body}</pre>
            {tpl && tpl.fields.length > 0 && Object.keys(doc.formData as object).length > 0 ? (
              <div style={{ marginTop: 18, padding: 14, background: "#faf9f5", border: "1px solid #d6dce1", borderRadius: 10 }}>
                <div className="dashboard-eyebrow" style={{ marginBottom: 8 }}>Form data</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", font: "400 13px 'DM Sans',sans-serif" }}>
                  {tpl.fields.map((f) => {
                    const v = String((doc.formData as Record<string, string>)[f.key] ?? "—");
                    if (v === "—") return null;
                    return (
                      <div key={f.key} style={{ display: "contents" }}>
                        <div style={{ color: "#5b6a78", font: "600 10px Manrope,sans-serif", letterSpacing: ".06em", textTransform: "uppercase", alignSelf: "end" }}>{f.label}</div>
                        <div style={{ color: "#0e1a26" }}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="adm-card" style={{ padding: 22, background: "#fff", border: "1px solid #d6dce1", borderRadius: 14 }}>
            {isCancelled ? (
              <div className="dashboard-alert"><p>The practice cancelled this form. No signatures are needed.</p></div>
            ) : isSigned ? (
              <div>
                <div className="dashboard-eyebrow" style={{ color: "#2f6b3a" }}>
                  <CheckCircle2 size={12} aria-hidden="true" /> Captured
                </div>
                <h3 style={{ font: "700 18px Fraunces,Georgia,serif", marginTop: 6 }}>All signatures captured</h3>
                <p className="dashboard-sm" style={{ color: "#5b6a78", marginTop: 4 }}>
                  {sigs.length} of {doc.requiredSigners} signatures complete · finalised {fmtDate(doc.signedAt)}
                </p>
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {sigs.map((s) => (
                    <div key={s.id} className="adm-card" style={{ padding: 12, background: "#faf9f5", borderRadius: 10 }}>
                      <div style={{ font: "600 13px 'DM Sans',sans-serif" }}>{s.signerName}</div>
                      <div className="dashboard-sm" style={{ color: "#5b6a78" }}>{s.signerRole ?? "Signer"} · {fmtDate(s.signedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : alreadySigned ? (
              <div>
                <div className="dashboard-eyebrow" style={{ color: "#7a5b1c" }}>
                  <Clock size={12} aria-hidden="true" /> Awaiting more signers
                </div>
                <h3 style={{ font: "700 18px Fraunces,Georgia,serif", marginTop: 6 }}>You've signed</h3>
                <p className="dashboard-sm" style={{ color: "#5b6a78", marginTop: 4 }}>
                  {sigs.length} of {doc.requiredSigners} signatures complete. The form is locked in once everyone signs.
                </p>
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {sigs.map((s) => (
                    <div key={s.id} className="adm-card" style={{ padding: 12, background: "#faf9f5", borderRadius: 10 }}>
                      <div style={{ font: "600 13px 'DM Sans',sans-serif" }}>{s.signerName}</div>
                      <div className="dashboard-sm" style={{ color: "#5b6a78" }}>{s.signerRole ?? "Signer"} · {fmtDate(s.signedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <SignFormClient
                documentId={doc.id}
                userDisplayName={user.displayName ?? user.email ?? "Client"}
                userEmail={user.email ?? ""}
                requiredSigners={doc.requiredSigners}
                esignConsent={ESIGN_CONSENT}
                templateSigners={tpl?.signers ?? [{ role: "client", label: "Signature", required: true }]}
              />
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
