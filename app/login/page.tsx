"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import SiteFooter from "../_components/SiteFooter";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const justVerified = searchParams.get("verified") === "1";

  async function signIn(emailValue: string, passwordValue: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue, audience: "client" }),
      });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string; role?: string; mfaRequired?: boolean; mfaToken?: string; mfaEnrollmentRequired?: boolean });

      if (data.mfaRequired && data.mfaToken) {
        // Password verified; second factor needed.
        setMfaToken(data.mfaToken);
        setMfaCode("");
        setError(null);
        setBusy(false);
        return;
      }

      if (!res.ok || !data.ok) {
        setError(
          data.error === "wrong_portal"
            ? "That is a team account. Agents sign in through the team portal."
            : data.error === "too_many_attempts"
              ? "Too many sign-in attempts. Please wait a few minutes and try again."
              : "We could not sign you in. Check your email and password.",
        );
        setBusy(false);
        return;
      }

      // Admins can require MFA for all staff: send unenrolled staff
      // straight to enrollment after sign-in.
      if (data.mfaEnrollmentRequired) {
        router.push("/account/mfa?required=1");
        router.refresh();
        return;
      }

      router.push(data.role === "client" ? "/dashboard/client" : "/dashboard/admin");
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await signIn(email, password);
  }

  async function onMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !mfaToken || mfaCode.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mfaToken, code: mfaCode.trim() }),
      });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string; role?: string });
      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_code"
            ? "That code didn't work. Check your authenticator app and try again."
            : data.error === "too_many_attempts"
              ? "Too many attempts. Please wait a few minutes."
              : data.error === "invalid_or_expired"
                ? "This verification expired. Sign in again from the start."
                : "Verification failed. Try again.",
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
    <>
    <div className="login-simple">
      {/* Warm the cache for the portal stylesheet (no longer global) so the
          post-login client-side navigation renders styled immediately. */}
      <link rel="prefetch" href="/dashboard.css" as="style" />
      <header className="login-simple-header">
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="login-title">
          <div className="login-card-logo">
            <img src="/assets/honore-logo-cropped.png" alt="I Honore Tax & Wealth" />
          </div>
          <span className="login-eyebrow">I HONORE TAX &amp; WEALTH</span>
          <h1 id="login-title">Welcome back.</h1>
          <p className="login-intro">Access your account.</p>

          {justRegistered ? (
            <p className="login-preview-note" role="status">
              Your account was created. Sign in below to get started.
            </p>
          ) : null}
          {justVerified ? (
            <p className="login-preview-note" role="status">
              Your email is verified. Sign in below.
            </p>
          ) : null}

          {mfaToken ? (
            <form className="login-simple-form" onSubmit={onMfaSubmit} noValidate>
              <p className="login-preview-note" role="status">
                Two-factor authentication is on for this account. Enter the
                6-digit code from your authenticator app (or a backup code).
              </p>
              <label htmlFor="login-mfa">Authentication code</label>
              <input
                id="login-mfa"
                name="mfaCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value)}
                required
                autoFocus
              />
              {error ? (
                <p className="login-preview-note" role="alert" id="login-error">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy || mfaCode.trim().length < 6}
                aria-describedby={error ? "login-error" : undefined}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                className="login-help"
                disabled={busy}
                onClick={() => { setMfaToken(null); setMfaCode(""); setError(null); }}
              >
                Back to sign in
              </button>
            </form>
          ) : (
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

            <PasswordInput
              id="login-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              disabled={busy}
            />

            {error ? (
              <p className="login-preview-note" role="alert" id="login-error">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || email.trim().length === 0 || password.length === 0}
              aria-describedby={error ? "login-error" : undefined}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          )}

          <p className="login-preview-note">
            This portal is where clients track their tax work, sign forms, review documents,
            request appointments, and message the team. Please do not submit sensitive tax
            information through the public consultation form.
          </p>
          <a className="login-help" href="/forgot-password">Forgot your password?</a>
          <a className="login-help" href="/register">Need an account? Register</a>
          <a className="login-help" href="/agent">Team or management? Sign in here</a>
          <a className="login-help" href="/contact">Need help? Contact our team</a>
        </section>
      </main>
    </div>
    <SiteFooter />
    </>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}