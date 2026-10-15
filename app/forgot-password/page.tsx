"use client";

import { useState } from "react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));

      if (!res.ok || !data.ok) {
        setError(
          data.error === "too_many_attempts"
            ? "Too many requests. Please wait and try again."
            : "We could not process that request. Please try again.",
        );
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login-simple">
      <header className="login-simple-header">
        <a href="/" aria-label="I Honore Tax & Wealth home">
          <img src="/assets/honore-logo-cropped.png" alt="I Honore Tax & Wealth" />
        </a>
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="forgot-title">
          <span className="login-eyebrow">I HONORE TAX &amp; WEALTH</span>
          <h1 id="forgot-title">Reset your password.</h1>

          {sent ? (
            <>
              {/* Identical wording whether or not the account exists, so this
                  page cannot be used to discover registered addresses. */}
              <p className="login-intro" role="status">
                If that address has an account, a reset link is on its way. The link expires in one
                hour and can be used once.
              </p>
              <a className="login-help" href="/login">Back to sign in</a>
            </>
          ) : (
            <form className="login-simple-form" onSubmit={onSubmit} noValidate>
              <p className="login-intro">Enter the email address on your account.</p>

              <label htmlFor="forgot-email">Email address</label>
              <input
                id="forgot-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />

              {error ? (
                <p className="login-preview-note" role="alert" id="forgot-error">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy} aria-describedby={error ? "forgot-error" : undefined}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <a className="login-help" href="/login">Back to sign in</a>
        </section>
      </main>
    </div>
  );
}