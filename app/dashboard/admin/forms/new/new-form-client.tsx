"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KIND_OPTIONS, TEMPLATES, type SignableKind } from "@/lib/signature-templates";

type ClientOption = { id: string; displayName: string; email: string | null };

type Props = {
  clients: ClientOption[];
  preselectedClient: string;
  preselectedKind: SignableKind;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  font: "600 10px Manrope,sans-serif",
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#5b6a78",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 7,
  border: "1px solid #d6dce1",
  background: "#fff",
  width: "100%",
};

/**
 * Admin "new signable form" form. Client-side so switching the template
 * re-renders the description, title placeholder, and pre-fill fields.
 *
 * Notes:
 * - There is intentionally NO hidden clientId input: the visible
 *   <select name="clientId"> is the single source of the submitted value.
 * - There is intentionally NO standalone tax-year input: the template's
 *   own tax-year field (e.g. formData.tax_year on the 1040) is the single
 *   tax-year field, and the API derives the document's taxYear from it.
 */
export default function NewFormClient({ clients, preselectedClient, preselectedKind }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<SignableKind>(preselectedKind);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tpl = TEMPLATES[kind] ?? TEMPLATES.custom;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = e.currentTarget;
      const res = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body?.id) {
        setError(
          body?.error
            ? `Could not create the form: ${body.error}. Nothing was saved — fix the highlighted fields and try again.`
            : "Could not create the form. Nothing was saved — try again.",
        );
        setSubmitting(false);
        return;
      }
      // Success: the list page shows a "Form created" banner for ?created=.
      router.push(`/dashboard/admin/forms?created=${body.id}`);
    } catch (err) {
      setError(`Could not create the form: ${String((err as Error).message ?? err)}. Nothing was saved.`);
      setSubmitting(false);
    }
  }

  return (
    <form
      className="adm-clients-upload"
      onSubmit={handleSubmit}
      style={{ flexDirection: "column", alignItems: "stretch", gap: 14, padding: 18, border: "1px solid #dabc88" }}
    >
      <div>
        <label htmlFor="adm-form-client" style={labelStyle}>Client</label>
        <select
          id="adm-form-client"
          name="clientId"
          required
          defaultValue={preselectedClient}
          className="adm-team-form"
          style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff" }}
        >
          <option value="">— select a client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}{c.email ? ` (${c.email})` : ""}
            </option>
          ))}
        </select>
        {clients.length === 0 ? (
          <p className="adm-sm" style={{ marginTop: 6, color: "#a63b37" }}>No clients visible to you yet. Add clients first or ask an admin to grant you access.</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="adm-form-kind" style={labelStyle}>Form template</label>
        <select
          id="adm-form-kind"
          name="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value as SignableKind)}
          className="adm-team-form"
          style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff" }}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <p className="adm-sm" style={{ marginTop: 6 }}>{tpl.description}</p>
      </div>

      <div>
        <label htmlFor="adm-form-title" style={labelStyle}>Title (shown to client)</label>
        <input
          id="adm-form-title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          placeholder={tpl.defaultTitle({})}
          style={inputStyle}
        />
      </div>

      {tpl.fields.length > 0 ? (
        <details open style={{ background: "#faf3df", border: "1px solid #dabc88", borderRadius: 10, padding: "10px 14px" }}>
          <summary style={{ cursor: "pointer", font: "700 12px Manrope,sans-serif", letterSpacing: ".06em", textTransform: "uppercase", color: "#0a1828" }}>
            Pre-fill form data ({tpl.fields.length} fields)
          </summary>
          <p className="adm-sm" style={{ marginTop: 6 }}>
            Type the value for the client; they can adjust on the signing page if the field is editable (most are read-only for the client).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            {tpl.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`f-${f.key}`} style={labelStyle}>
                  {f.label}{f.required ? " *" : ""}
                  {f.helper ? <span className="adm-sm" style={{ marginLeft: 6, color: "#7a858e", textTransform: "none", fontWeight: 400 }}>({f.helper})</span> : null}
                </label>
                {f.type === "select" ? (
                  <select id={`f-${f.key}`} name={`formData.${f.key}`} defaultValue={f.defaultValue ?? ""} style={inputStyle}>
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
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div>
        <label htmlFor="adm-form-signers" style={labelStyle}>Required signers</label>
        <select
          id="adm-form-signers"
          name="requiredSigners"
          defaultValue="1"
          className="adm-team-form"
          style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", maxWidth: 220 }}
        >
          <option value="1">1 signer (default)</option>
          <option value="2">2 signers (e.g. taxpayer + spouse)</option>
          <option value="3">3 signers (taxpayer + spouse + preparer)</option>
        </select>
        <p className="adm-sm" style={{ marginTop: 6 }}>Default 1. Set 2 for a 1040 filed jointly, or 3 to capture the paid-preparer signature too.</p>
      </div>

      {error ? (
        <div className="adm-import-results" style={{ borderColor: "#a63b37", background: "#fdf1f0" }}>
          <p style={{ color: "#a63b37", margin: 0 }}><strong>Not saved.</strong> {error}</p>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" className="adm-btn" disabled={submitting}>
          {submitting ? "Creating…" : "Create & send to client"}
        </button>
        <Link href="/dashboard/admin/forms" className="adm-btn adm-btn-ghost" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none", border: "1px solid #d6dce1" }}>Cancel</Link>
        <span className="adm-sm" style={{ marginLeft: "auto" }}>The client gets the form on their portal home; you can also share a direct link.</span>
      </div>
    </form>
  );
}
