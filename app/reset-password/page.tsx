"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string; message?: string }));

      if (!res.ok || !data.ok) {
        setError(
          data.message ??
            "This reset link is invalid or has expired. Please request a new one.",
        );
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login-simple">
      <header className="login-simple-header">
        <a href="/" aria-label="Honoré Tax & Wealth home">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </a>
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="reset-title">
          <span className="login-eyebrow">HONORÉ TAX &amp; WEALTH</span>
          <h1 id="reset-title">Choose a new password.</h1>

          {done ? (
            <>
              <p className="login-intro">Your password has been changed.</p>
              <p className="login-preview-note">
                For your security, every other signed-in device has been signed out.
              </p>
              <a className="login-help" href="/login">Continue to sign in</a>
            </>
          ) : !token ? (
            <>
              <p className="login-intro">This reset link is missing its token.</p>
              <p className="login-preview-note">
                Request a new link from the sign-in page.
              </p>
              <a className="login-help" href="/login">Back to sign in</a>
            </>
          ) : (
            <form className="login-simple-form" onSubmit={onSubmit} noValidate>
              <p className="login-intro">Use at least 12 characters.</p>

              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={12}
              />

              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={12}
              />

              {error ? (
                <p className="login-preview-note" role="alert" id="reset-error">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy} aria-describedby={error ? "reset-error" : undefined}>
                {busy ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="login-simple"><main className="login-simple-main" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}