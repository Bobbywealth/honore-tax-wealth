"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

const CATEGORIES = [
  { value: "income", label: "Income (W-2, 1099)" },
  { value: "identity", label: "Identity (ID, SSN card)" },
  { value: "deductions", label: "Deductions & credits" },
  { value: "prior_return", label: "Prior year return" },
  { value: "business", label: "Business records" },
  { value: "other", label: "Other" },
];

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export default function DocumentUpload({
  taxYears,
  requestId,
}: {
  taxYears: Array<{ id: string; year: number }>;
  requestId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [taxYear, setTaxYear] = useState<string>(
    taxYears[0] ? String(taxYears[0].year) : String(new Date().getFullYear() - 1),
  );
  const [category, setCategory] = useState("income");

  async function upload(file: File) {
    setError(null);
    setDone(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Only PDF, JPG, PNG, or WebP files are accepted.");
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      setError("Files must be under 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("taxYear", taxYear);
      form.set("category", category);
      if (requestId) form.set("requestId", requestId);
      const res = await fetch("/api/client/documents/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });
      if (!res.ok || !data.ok) {
        setError(
          data.error === "file_too_large"
            ? "That file is over the 10 MB limit."
            : data.error === "unsupported_type"
              ? "Only PDF, JPG, PNG, or WebP files are accepted."
              : "Upload failed. Please try again.",
        );
      } else {
        setDone(`${file.name} uploaded.`);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) void upload(f);
  }

  return (
    <div className="dashboard-upload">
      <div
        className={`dashboard-upload-drop${dragOver ? " is-drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload a tax document"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
      >
        {busy ? (
          <Loader2 size={22} className="spin" aria-hidden="true" />
        ) : (
          <Upload size={22} aria-hidden="true" />
        )}
        <p>
          <strong>{busy ? "Uploading…" : "Drop a file here or click to choose"}</strong>
        </p>
        <p className="dashboard-quiet">PDF, JPG, PNG, or WebP · up to 10 MB</p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          aria-label="Choose a file to upload"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>

      <div className="dashboard-upload-meta">
        <label>
          Tax year
          <select value={taxYear} onChange={(e) => setTaxYear(e.target.value)} disabled={busy}>
            {taxYears.map((t) => (
              <option key={t.id} value={t.year}>{t.year}</option>
            ))}
            {!taxYears.some((t) => String(t.year) === taxYear) && (
              <option value={taxYear}>{taxYear}</option>
            )}
          </select>
        </label>
        <label>
          Document type
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="dashboard-alert-text" role="alert">{error}</p> : null}
      {done ? <p className="dashboard-success-text" role="status">{done}</p> : null}
      <p className="dashboard-quiet">
        Files are stored securely and only visible to you and your preparer.
      </p>
    </div>
  );
}
