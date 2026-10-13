"use client";

import { useState } from "react";
import PasswordInput from "@/components/PasswordInput";

/**
 * Form for signed-in users to change their own password.
 * Posts JSON { currentPassword, newPassword } to /api/auth/change-password.
 */
export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_current"
            ? "Your current password is incorrect."
            : data.error === "weak_password"
              ? `That password is too weak${data.hint ? `: ${data.hint}` : "."}`
              : "Couldn't change your password. Please try again.",
        );
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Couldn't change your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="login-simple-form" role="status">
        <p style={{ color: "#1a6e2e", fontWeight: 600 }}>
          Password changed. Your other signed-in devices were signed out as a precaution.
        </p>
      </div>
    );
  }

  return (
    <form className="login-simple-form" onSubmit={submit} noValidate={false}>
      <PasswordInput
        id="change-current"
        label="Current password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        required
        disabled={busy}
      />
      <PasswordInput
        id="change-new"
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        required
        minLength={12}
        disabled={busy}
      />
      <PasswordInput
        id="change-confirm"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
        minLength={12}
        disabled={busy}
      />
      {error ? (
        <p role="alert" style={{ color: "#b42323", fontSize: 13 }}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Changing…" : "Change password"}
      </button>
      <p className="login-simple-sub">
        Forgotten your current password?{" "}
        <a href="/forgot-password" style={{ color: "#d9b878" }}>
          Reset it by email
        </a>
      </p>
    </form>
  );
}
