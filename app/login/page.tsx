"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string; role?: string });

      if (!res.ok || !data.ok) {
        setError(
          data.error === "too_many_attempts"
            ? "Too many sign-in attempts. Please wait a few minutes and try again."
            : "We could not sign you in. Check your email and password.",
        );
        setBusy(false);
        return;
      }

      router.push(data.role === "client" ? "/dashboard/client" : "/dashboard/admin");
      router.refresh();
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
        <section className="login-simple-panel" aria-labelledby="login-title">
          <span className="login-eyebrow">HONORÉ TAX &amp; WEALTH</span>
          <h1 id="login-title">Welcome back.</h1>
          <p className="login-intro">Access your account.</p>

          <form className="login-simple-form" onSubmit={onSubmit} noValidate>
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            {error ? (
              <p className="login-preview-note" role="alert" id="login-error">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} aria-describedby={error ? "login-error" : undefined}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="login-preview-note">
            This portal is for your tax documents and messages. Please do not submit sensitive tax
            information through the public consultation form.
          </p>
          <a className="login-help" href="/#contact">Need help? Contact our team</a>
        </section>
      </main>
    </div>
  );
}