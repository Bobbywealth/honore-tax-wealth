"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

type Created = { email: string; tempPassword: string; role: string };

const ERRORS: Record<string, string> = {
  email_already_exists: "An account with that email already exists.",
  validation_failed: "Email + name + role are required.",
  unauthorized: "Only an admin can add team members. Sign in again.",
  database_unavailable: "The database is unavailable. Try again shortly.",
  payload_too_large: "That request was too large.",
  db_error: "Could not create the account. Try again shortly.",
};

/**
 * Add a staff account and show its temporary password exactly once.
 *
 * The invite API only returns `tempPassword` on its JSON path, and the old
 * plain HTML form posted form data, so the page could only say
 * "(see response)" and the new account was unusable. Posting JSON here keeps
 * the password out of the URL, history and logs: it lives only in this
 * component's state until the admin dismisses it or leaves the page.
 */
export default function AddStaffForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    setPending(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email,
          displayName: String(data.get("displayName") ?? "").trim(),
          role: String(data.get("role") ?? "staff"),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; tempPassword: string; role: string }
        | { ok: false; error?: string }
        | null;
      if (!body || !body.ok) {
        const code = body && !body.ok ? body.error ?? "" : "";
        setError(ERRORS[code] ?? "Could not create the account. Try again shortly.");
        return;
      }
      setCreated({ email: email.toLowerCase(), tempPassword: body.tempPassword, role: body.role });
      form.reset();
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form id="adm-team-add" className="adm-team-form" onSubmit={onSubmit}>
      <div>
        <label htmlFor="adm-team-email">Email</label>
        <input id="adm-team-email" name="email" type="email" required maxLength={180} placeholder="name@honoretaxwealth.com" />
      </div>
      <div>
        <label htmlFor="adm-team-name">Display name</label>
        <input id="adm-team-name" name="displayName" required minLength={2} maxLength={120} placeholder="Full name" />
      </div>
      <div>
        <label htmlFor="adm-team-role">Role</label>
        <select id="adm-team-role" name="role" required defaultValue="staff">
          <option value="staff">Agent (staff)</option>
          <option value="assistant">Assistant</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="adm-team-form-submit" aria-live="polite">
        <button type="submit" className="adm-btn" disabled={pending}>
          <UserPlus size={14} aria-hidden="true" /> {pending ? "Adding…" : "Add to team"}
        </button>
        {error ? <span className="adm-form-err" role="alert">{error}</span> : null}
        {created ? (
          <span className="adm-form-msg">
            Account created for {created.email}. Temporary password (shown once; share it privately and ask them to
            change it after signing in at /agent): <code>{created.tempPassword}</code>{" "}
            <button type="button" className="adm-btn adm-btn-ghost" onClick={copy} style={{ padding: "2px 8px", fontSize: 11 }}>
              {copied ? "Copied" : "Copy"}
            </button>{" "}
            <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setCreated(null)} style={{ padding: "2px 8px", fontSize: 11 }}>
              Done
            </button>
          </span>
        ) : null}
      </div>
    </form>
  );
}
