"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

export default function ChangePasswordForm({
  userLabel,
  role,
}: {
  userLabel: string;
  role: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (next.length < 12) {
      setFeedback({ kind: "err", text: "New password must be at least 12 characters." });
      return;
    }
    if (next !== confirm) {
      setFeedback({ kind: "err", text: "Passwords do not match. Re-type the new password." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setFeedback({
          kind: "ok",
          text: "Password updated. Other devices were signed out.",
        });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setFeedback({
          kind: "err",
          text:
            data.message ||
            (data.error === "invalid_credentials"
              ? "Your current password is incorrect."
              : data.error === "weak_password"
                ? "That password is too weak. Use at least 12 characters with a mix of letters, numbers, and symbols."
                : "Could not change your password. Try again."),
        });
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 480 }}>
      <p className="dashboard-quiet" style={{ marginTop: 0 }}>
        Signed in as <strong>{userLabel}</strong> ({role}).
      </p>
      <form onSubmit={onSubmit} className="adm-quick-form" aria-label="Change password">
        <div className="adm-quick-form-row">
          <PasswordInput
            id="current"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </div>
        <div className="adm-quick-form-row">
          <PasswordInput
            id="next"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            required
            minLength={12}
            disabled={busy}
          />
        </div>
        <div className="adm-quick-form-row">
          <PasswordInput
            id="confirm"
            label="Re-type new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
            minLength={12}
            disabled={busy}
          />
        </div>
        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            className={`form-feedback${feedback.kind === "ok" ? " is-ok" : " is-err"}`}
            style={{ margin: 0 }}
          >
            {feedback.text}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button type="submit" className="adm-btn" disabled={busy} aria-busy={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
          <Link href="/dashboard/profile" className="dashboard-button dashboard-button-secondary" style={{ marginLeft: 0 }}>
            Back to profile
          </Link>
        </div>
      </form>
    </section>
  );
}
