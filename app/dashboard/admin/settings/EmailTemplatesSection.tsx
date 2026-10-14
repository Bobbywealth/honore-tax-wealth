"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";

type Template = { id: string; key: string; name: string; subject: string; body: string };

export default function EmailTemplatesSection() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/email-templates")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setTemplates(j.templates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(t: Template) {
    setEditing(t.key);
    setDraftSubject(t.subject);
    setDraftBody(t.body);
    setErr(null);
    setSaved(null);
  }

  async function save(key: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/settings/email-templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, subject: draftSubject, body: draftBody }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not save");
      setTemplates((ts) => ts.map((t) => (t.key === key ? { ...t, subject: draftSubject, body: draftBody } : t)));
      setEditing(null);
      setSaved(key);
      setTimeout(() => setSaved(null), 3000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adm-settings-pane" id="templates" style={{ marginTop: 14 }}>
      <h3>Email templates</h3>
      <div className="sub">
        The subject lines and bodies the practice sends. Use {"{{name}}"}, {"{{date}}"} style placeholders — they are filled in when the email goes out.
      </div>
      {loading ? (
        <div className="sm">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="sm">No templates found.</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {templates.map((t) => (
            <div key={t.key} className="adm-settings-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{t.name}</b>
                {editing === t.key ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    <label className="sm">
                      Subject
                      <input
                        className="adm-input"
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        maxLength={240}
                        style={{ marginTop: 4, width: "100%" }}
                      />
                    </label>
                    <label className="sm">
                      Body
                      <textarea
                        className="adm-input"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={6}
                        style={{ marginTop: 4, width: "100%", fontFamily: "inherit" }}
                      />
                    </label>
                    {err ? <span className="sm" style={{ color: "#a63b37" }}>{err}</span> : null}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="adm-btn adm-btn-mini" onClick={() => save(t.key)} disabled={busy}>
                        <Check size={12} /> {busy ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="adm-btn adm-btn-mini adm-btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sm" style={{ marginTop: 4 }}>Subject: {t.subject}</div>
                    <div className="sm" style={{ whiteSpace: "pre-wrap", marginTop: 4, color: "#5b6a78" }}>
                      {t.body.length > 160 ? t.body.slice(0, 160) + "…" : t.body}
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {saved === t.key ? <span className="adm-tag bl">Saved</span> : null}
                {editing !== t.key ? (
                  <button type="button" className="adm-clients-filter" onClick={() => startEdit(t)} aria-label={`Edit ${t.name}`}>
                    <Pencil size={12} /> Edit
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
