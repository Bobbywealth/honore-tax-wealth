"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Add-client form with fetch-based submit.
 *
 * The previous native form POST gave no visible feedback on success —
 * the button appeared to do nothing, which invited double-clicks and
 * duplicate client records. This version disables the button while
 * submitting, surfaces API errors inline, and navigates to ?created=1
 * on success so the page shows its "Client added." confirmation and a
 * refreshed list.
 */
export default function NewClientForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = e.currentTarget;
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body?.id) {
        setError(
          body?.error
            ? `Could not add the client: ${body.error}. Nothing was saved — check the fields and try again.`
            : "Could not add the client. Nothing was saved — try again.",
        );
        setSubmitting(false);
        return;
      }
      // Success: the list page shows a "Client added." banner for ?created=1.
      router.push("/dashboard/admin/clients?created=1");
    } catch (err) {
      setError(`Could not add the client: ${String((err as Error).message ?? err)}. Nothing was saved.`);
      setSubmitting(false);
    }
  }

  return (
    <form className="adm-quick-form" onSubmit={handleSubmit}>
      {error ? (
        <p className="adm-sm" role="alert" style={{ color: "#a33", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="adm-quick-form-row">
        <label>Display name<input name="displayName" required minLength={2} maxLength={120} autoComplete="off" placeholder="e.g. Jordan Rivera" /></label>
        <label>Email<input name="email" type="email" maxLength={180} autoComplete="email" placeholder="Optional" /></label>
      </div>
      <div className="adm-quick-form-row">
        <label>Phone<input name="phone" type="tel" maxLength={30} autoComplete="tel" placeholder="Optional" /></label>
        <label>Status
          <select name="status" defaultValue="prospect">
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
          </select>
        </label>
      </div>
      <div className="adm-quick-form-actions">
        <button type="submit" className="adm-btn" disabled={submitting}>
          {submitting ? "Adding…" : "Add client"}
        </button>
        <a className="adm-btn adm-btn-ghost" href="/dashboard/admin/clients">Cancel</a>
      </div>
    </form>
  );
}
