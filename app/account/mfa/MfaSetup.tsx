"use client";

import { useState } from "react";

type Step = "idle" | "scanning" | "backup";

/**
 * TOTP enrollment UI.
 *
 * 1. idle: "Enable two-factor" button.
 * 2. scanning: shows otpauth URL + secret for manual entry, code input.
 *    (QR rendering needs a QR library; the URL works with any scanner
 *    app's manual-entry or URL-paste flow.)
 * 3. backup: shows single-use backup codes once.
 */
export default function MfaSetup() {
  const [step, setStep] = useState<Step>("idle");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError("Could not start setup. Try again.");
        return;
      }
      setOtpauthUrl(data.otpauthUrl);
      setSecret(data.secret);
      setStep("scanning");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_code"
            ? "That code didn't work. Check your authenticator app and try again."
            : "Confirmation failed. Try again.",
        );
        return;
      }
      setBackupCodes(data.backupCodes ?? []);
      setStep("backup");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; user can select manually
    }
  }

  if (step === "backup") {
    return (
      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">TWO-FACTOR AUTH</span>
          <h2>Save your backup codes</h2>
        </div>
        <div className="dashboard-alert">
          <p>
            <strong>Write these down now.</strong> Each code works once if you
            lose your authenticator. They will never be shown again.
          </p>
        </div>
        <ul className="dashboard-backup-codes">
          {backupCodes.map((c) => (
            <li key={c}><code>{c}</code></li>
          ))}
        </ul>
        <p className="dashboard-quiet">
          Two-factor authentication is now on. You will be asked for a code on
          every sign-in.
        </p>
      </div>
    );
  }

  if (step === "scanning") {
    return (
      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">TWO-FACTOR AUTH</span>
          <h2>Link your authenticator app</h2>
        </div>
        <ol className="dashboard-steps">
          <li>Open your authenticator app (Google Authenticator, 1Password, Authy, …).</li>
          <li>
            Add a new account — paste this setup link or enter the secret manually:
            <div className="dashboard-mfa-secret">
              <code className="dashboard-mfa-url">{otpauthUrl}</code>
              <button type="button" className="dashboard-button dashboard-button-secondary" onClick={copySecret}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="dashboard-quiet">
              Manual entry secret: <code>{secret}</code>
            </p>
          </li>
          <li>Enter the 6-digit code from the app to confirm.</li>
        </ol>
        <form onSubmit={confirm} className="dashboard-note-form">
          <label htmlFor="mfa-code">6-digit code</label>
          <input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          {error ? <p className="dashboard-alert-text" role="alert">{error}</p> : null}
          <button type="submit" className="dashboard-button" disabled={busy || code.trim().length < 6}>
            {busy ? "Verifying…" : "Confirm and enable"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="dashboard-section">
      <div className="dashboard-section-head">
        <span className="dashboard-eyebrow">TWO-FACTOR AUTH</span>
        <h2>Two-factor authentication</h2>
        <p className="dashboard-quiet">
          Add a second step to sign-in with a time-based code from your
          authenticator app. Recommended for everyone; admins can require it
          for all agents.
        </p>
      </div>
      {error ? <p className="dashboard-alert-text" role="alert">{error}</p> : null}
      <button type="button" className="dashboard-button" onClick={begin} disabled={busy}>
        {busy ? "Starting…" : "Enable two-factor authentication"}
      </button>
    </div>
  );
}
