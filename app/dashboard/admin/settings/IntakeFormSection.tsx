"use client";

import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";

type Field = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  sortOrder: number;
  isCustom: boolean;
};

const FIELD_TYPES = ["text", "email", "tel", "textarea", "select"] as const;

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`adm-switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    />
  );
}

export default function IntakeFormSection() {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<string>("text");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/intake-form")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setFields(j.fields);
      })
      .catch(() => setErr("Could not load intake fields."))
      .finally(() => setLoading(false));
  }, []);

  async function toggleRequired(fieldKey: string, required: boolean) {
    const prev = fields;
    setFields((fs) => fs.map((f) => (f.fieldKey === fieldKey ? { ...f, required } : f)));
    try {
      const res = await fetch("/api/admin/settings/intake-form", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldKey, required }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not save");
    } catch {
      setFields(prev);
      setErr("Could not save — change reverted.");
    }
  }

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/settings/intake-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), fieldType: newType }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not add field");
      const list = await fetch("/api/admin/settings/intake-form").then((r) => r.json());
      if (list.ok) setFields(list.fields);
      setNewLabel("");
      setNewType("text");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function removeField(fieldKey: string) {
    if (!confirm("Remove this custom field?")) return;
    const prev = fields;
    setFields((fs) => fs.filter((f) => f.fieldKey !== fieldKey));
    try {
      const res = await fetch(`/api/admin/settings/intake-form?fieldKey=${encodeURIComponent(fieldKey)}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not remove");
    } catch {
      setFields(prev);
      setErr("Could not remove — change reverted.");
    }
  }

  return (
    <section className="adm-settings-pane" id="intake" style={{ marginTop: 14 }}>
      <h3>Intake forms</h3>
      <div className="sub">
        Fields on the public consultation request form. Toggle whether each field is required, or add custom fields of your own.
      </div>
      {loading ? (
        <div className="sm">Loading fields…</div>
      ) : (
        <>
          {err ? <div className="sm" style={{ color: "#a63b37", marginTop: 8 }}>{err}</div> : null}
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {fields.map((f) => (
              <div key={f.fieldKey} className="adm-settings-row">
                <div>
                  <b>{f.label}</b>
                  <div className="sm">
                    {f.fieldType}
                    {f.isCustom ? " · custom" : " · core"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="sm">{f.required ? "Required" : "Optional"}</span>
                  <Switch on={f.required} onChange={(v) => toggleRequired(f.fieldKey, v)} label={`${f.label} required`} />
                  {f.isCustom ? (
                    <button
                      type="button"
                      className="adm-clients-filter"
                      onClick={() => removeField(f.fieldKey)}
                      aria-label={`Remove ${f.label}`}
                    >
                      <X size={12} /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={addField} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="sm">
              New custom field
              <input
                className="adm-input"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Preferred contact time"
                maxLength={160}
                style={{ marginTop: 4, display: "block" }}
              />
            </label>
            <label className="sm">
              Type
              <select
                className="adm-input"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                style={{ marginTop: 4, display: "block" }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="adm-btn adm-btn-mini" disabled={adding || !newLabel.trim()}>
              <Plus size={12} /> {adding ? "Adding…" : "Add field"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
