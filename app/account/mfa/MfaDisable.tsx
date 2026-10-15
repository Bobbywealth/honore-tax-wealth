"use client";

import { useState } from "react";

/** Disable MFA after proving possession with a current TOTP code. */
export default function MfaDisable() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_code"
            ? "That code didn't work. Try again."
            : "Could not disable two-factor. Try again.",
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="dashboard-button dashboard-button-secondary"
        onClick={() => setOpen(true)}
      >
        Disable two-factor
      </button>
    );
  }

  return (
    <form onSubmit={disable} className="dashboard-note-form">
      <p className="dashboard-quiet">
        To disable, enter a current code from your authenticator app.
      </p>
      <label htmlFor="mfa-disable-code">6-digit code</label>
      <input
        id="mfa-disable-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />
      {error ? <p className="dashboard-alert-text" role="alert">{error}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="dashboard-button" disabled={busy || code.trim().length < 6}>
          {busy ? "Disabling…" : "Confirm disable"}
        </button>
        <button
          type="button"
          className="dashboard-button dashboard-button-secondary"
          disabled={busy}
          onClick={() => { setOpen(false); setCode(""); setError(null); }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
