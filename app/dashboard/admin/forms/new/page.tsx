import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import DashboardShell from "../../../DashboardShell";
import { loadAdminNavCounts } from "../../lib/nav-counts";
import { navForRole } from "../../_lib/nav";
import { checkAdminAccess } from "../../auth";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { KIND_OPTIONS, TEMPLATES } from "@/lib/signature-templates";

export const dynamic = "force-dynamic";

export default async function NewFormPage({ searchParams }: { searchParams?: Promise<{ client?: string; kind?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;
  const me = await currentUser();
  const isAdmin = me?.role === "admin";
  const counts = await loadAdminNavCounts();
  const nav = navForRole(me?.role, counts);
  const sp = (await searchParams) ?? {};
  const preselectedClient = sp.client ?? "";
  const preselectedKind = (sp.kind as keyof typeof TEMPLATES) ?? "form_1040";

  let clientRows: Array<{ id: string; displayName: string; email: string | null }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    clientRows = await db
      .select({ id: clients.id, displayName: clients.displayName, email: clients.email })
      .from(clients)
      .orderBy(asc(clients.displayName))
      .limit(500);
  } catch {
    unavailable = true;
  }

  // Filter for non-admin via owner_id exists check
  let scopedClients = clientRows;
  if (!isAdmin && me?.id) {
    try {
      const db = getDb();
      const owned = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          sql`exists (select 1 from engagements where engagements.client_id = ${clients.id} and engagements.owner_id = ${me.id})`,
        );
      const ownedIds = new Set(owned.map((o) => o.id));
      scopedClients = clientRows.filter((c) => ownedIds.has(c.id));
    } catch {
      scopedClients = [];
    }
  }

  const tpl = TEMPLATES[preselectedKind] ?? TEMPLATES.custom;

  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/forms" audience="Admin" title="New signable form" description="Choose a template, pick a client, and pre-fill the data — the client signs in their portal.">
      <div className="adm-page-h">
        <div>
          <Link href="/dashboard/admin/forms" className="adm-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={12} /> Back to forms
          </Link>
          <h1 style={{ marginTop: 6 }}>New signable form</h1>
          <div className="sub">Pick a client, choose a template, and pre-fill the data.</div>
        </div>
      </div>

      {unavailable ? (
        <div className="adm-empty"><p>Could not load clients.</p></div>
      ) : (
        <form className="adm-clients-upload" action="/api/admin/forms" method="post" encType="application/x-www-form-urlencoded" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, padding: 18, border: "1px solid #dabc88" }}>
          <input type="hidden" name="clientId" value={preselectedClient} />

          <div>
            <label htmlFor="adm-form-client" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Client</label>
            <select id="adm-form-client" name="clientId" required className="adm-team-form" style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff" }}>
              <option value="">— select a client —</option>
              {scopedClients.map((c) => (
                <option key={c.id} value={c.id} selected={c.id === preselectedClient}>
                  {c.displayName}{c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
            {scopedClients.length === 0 ? (
              <p className="adm-sm" style={{ marginTop: 6, color: "#a63b37" }}>No clients visible to you yet. Add clients first or ask an admin to grant you access.</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="adm-form-kind" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Form template</label>
            <select id="adm-form-kind" name="kind" required className="adm-team-form" style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff" }}>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value} selected={k.value === preselectedKind}>{k.label}</option>
              ))}
            </select>
            <p className="adm-sm" style={{ marginTop: 6 }}>{tpl.description}</p>
          </div>

          <div>
            <label htmlFor="adm-form-title" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Title (shown to client)</label>
            <input id="adm-form-title" name="title" required minLength={2} maxLength={200} placeholder={tpl.defaultTitle({}) } style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%" }} />
          </div>

          {tpl.fields.length > 0 ? (
            <details open style={{ background: "#faf3df", border: "1px solid #dabc88", borderRadius: 10, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", font: "700 12px Manrope,sans-serif", letterSpacing: ".06em", textTransform: "uppercase", color: "#0a1828" }}>Pre-fill form data ({tpl.fields.length} fields)</summary>
              <p className="adm-sm" style={{ marginTop: 6 }}>Each field below renders as a hidden <code>formData[KEY]</code> in the JSON. Type the value for the client; they can adjust on the signing page if the field is editable (most are read-only for the client).</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                {tpl.fields.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`f-${f.key}`} style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>
                      {f.label}{f.required ? " *" : ""}
                      {f.helper ? <span className="adm-sm" style={{ marginLeft: 6, color: "#7a858e", textTransform: "none", fontWeight: 400 }}>({f.helper})</span> : null}
                    </label>
                    {f.type === "select" ? (
                      <select id={`f-${f.key}`} name={`formData.${f.key}`} defaultValue={f.defaultValue ?? ""} style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%" }}>
                        <option value="">—</option>
                        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "checkbox" ? (
                      <input id={`f-${f.key}`} name={`formData.${f.key}`} type="checkbox" value="true" />
                    ) : (
                      <input
                        id={`f-${f.key}`}
                        name={`formData.${f.key}`}
                        type={f.type === "number" || f.type === "currency" ? "number" : "text"}
                        defaultValue={f.defaultValue ?? ""}
                        required={f.required}
                        maxLength={f.type === "currency" ? 16 : 200}
                        style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div>
            <label htmlFor="adm-form-signers" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Required signers</label>
            <select id="adm-form-signers" name="requiredSigners" defaultValue="1" className="adm-team-form" style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", maxWidth: 220 }}>
              <option value="1">1 signer (default)</option>
              <option value="2">2 signers (e.g. taxpayer + spouse)</option>
              <option value="3">3 signers (taxpayer + spouse + preparer)</option>
            </select>
            <p className="adm-sm" style={{ marginTop: 6 }}>Default 1. Set 2 for a 1040 filed jointly, or 3 to capture the paid-preparer signature too.</p>
          </div>

          <div>
            <label htmlFor="adm-form-taxyear" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Tax year (optional)</label>
            <input id="adm-form-taxyear" name="taxYear" type="number" min="2000" max="2100" placeholder="2025" style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", maxWidth: 220 }} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="submit" className="adm-btn">Create &amp; send to client</button>
            <Link href="/dashboard/admin/forms" className="adm-btn adm-btn-ghost" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none", border: "1px solid #d6dce1" }}>Cancel</Link>
            <span className="adm-sm" style={{ marginLeft: "auto" }}>The client gets the form on their portal home; you can also share a direct link.</span>
          </div>
        </form>
      )}
    </DashboardShell>
  );
}
