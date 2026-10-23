"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

/**
 * Shared sign-in form for both portals.
 *
 * The client portal and the team/management portal are separate entry points
 * with separate intent, so each passes its own `audience`. The server enforces
 * that audience against the account's role BEFORE minting a session (see
 * app/api/auth/login/route.ts), which makes the split a real access boundary
 * rather than two skins over one door.
 *
 * This component carries the full MFA flow so the two entry points cannot
 * drift apart on second-factor behaviour.
 */

export type PortalAudience = "client" | "agent";

type Props = {
  audience: PortalAudience;
  eyebrow: string;
  title: string;
  intro: string;
  /** Where a successfully authenticated person lands. */
  postLoginAdmin: string;
  postLoginDefault: string;
  /** Message shown when the credential belongs to the other portal. */
  wrongPortalMessage: string;
  /** Links rendered below the form, in order. */
  footerLinks: Array<{ href: string; label: string }>;
  note: string;
  emailPlaceholder?: string;
};

export default function PortalLoginForm({
  audience,
  eyebrow,
  title,
  intro,
  postLoginAdmin,
  postLoginDefault,
  wrongPortalMessage,
  footerLinks,
  note,
  emailPlaceholder = "you@example.com",
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signIn(emailValue: string, passwordValue: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue, audience }),
      });
      const data = await res
        .json()
        .catch(
          () =>
            ({}) as {
              ok?: boolean;
              error?: string;
              role?: string;
              mfaRequired?: boolean;
              mfaToken?: string;
              mfaEnrollmentRequired?: boolean;
            },
        );

      if (data.mfaRequired && data.mfaToken) {
        // Password verified; second factor needed.
        setMfaToken(data.mfaToken);
        setMfaCode("");
        setError(null);
        setBusy(false);
        return;
      }

      if (data.error === "wrong_portal") {
        setError(wrongPortalMessage);
        setBusy(false);
        return;
      }

      if (!res.ok || !data.ok) {
        setError(
          data.error === "too_many_attempts"
            ? "Too many sign-in attempts. Please wait a few minutes and try again."
            : data.error === "account_deactivated"
              ? "This account has been deactivated. Contact management if that is unexpected."
              : "We could not sign you in. Check your email and password.",
        );
        setBusy(false);
        return;
      }

      // Admins can require MFA for all staff: send unenrolled staff straight
      // to enrollment after sign-in.
      if (data.mfaEnrollmentRequired) {
        router.push("/account/mfa?required=1");
        router.refresh();
        return;
      }

      router.push(data.role === "admin" ? postLoginAdmin : postLoginDefault);
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
      const data = await res
        .json()
        .catch(() => ({}) as { ok?: boolean; error?: string; role?: string });
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
      router.push(data.role === "admin" ? postLoginAdmin : postLoginDefault);
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login-simple">
      {/* Warm the cache for the portal stylesheet so the post-login
          client-side navigation renders styled immediately. */}
      <link rel="prefetch" href="/dashboard.css" as="style" />
      <header className="login-simple-header">
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="portal-login-title">
          <div className="login-card-logo">
            <img src="/assets/honore-logo-cropped.png" alt="I Honore Tax & Wealth" />
          </div>
          <span className="login-eyebrow">{eyebrow}</span>
          <h1 id="portal-login-title">{title}</h1>
          <p className="login-intro">{intro}</p>

          {mfaToken ? (
            <form className="login-simple-form" onSubmit={onMfaSubmit} noValidate>
              <label htmlFor="portal-mfa">Authentication code</label>
              <input
                id="portal-mfa"
                name="mfaCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={12}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value)}
                required
                autoFocus
              />
              {error ? (
                <p className="login-preview-note" role="alert" id="portal-mfa-error">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy || mfaCode.trim().length < 6}
                aria-describedby={error ? "portal-mfa-error" : undefined}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                className="login-help"
                onClick={() => {
                  setMfaToken(null);
                  setMfaCode("");
                  setError(null);
                }}
              >
                Start over
              </button>
            </form>
          ) : (
            <form className="login-simple-form" onSubmit={onSubmit} noValidate>
              <label htmlFor="portal-email">Email address</label>
              <input
                id="portal-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={emailPlaceholder}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />

              <PasswordInput
                id="portal-password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                disabled={busy}
              />

              {error ? (
                <p className="login-preview-note" role="alert" id="portal-login-error">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy || email.trim().length === 0 || password.length === 0}
                aria-describedby={error ? "portal-login-error" : undefined}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          <p className="login-preview-note">{note}</p>
          {footerLinks.map((l) => (
            <a key={l.href} className="login-help" href={l.href}>
              {l.label}
            </a>
          ))}
        </section>
      </main>
    </div>
  );
}
