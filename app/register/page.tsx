"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import SiteFooter from "../_components/SiteFooter";

function RegisterForm() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agent") ?? "";
  const [agentName, setAgentName] = useState<string | null>(null);

  // Look up the selected agent's name for display.
  useEffect(() => {
    if (agentId) {
      fetch("/api/agents")
        .then((r) => r.json())
        .then((d) => {
          const found = (d.agents ?? []).find((a: { id: string }) => a.id === agentId);
          if (found) setAgentName(found.name);
        })
        .catch(() => {});
    }
  }, [agentId]);

  const valid =
    displayName.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 12 &&
    confirmPassword.length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !valid) return;
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          confirmPassword,
          agentId: agentId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });

      if (!res.ok || !data.ok) {
        setError(
          data.error === "email_in_use"
            ? "An account with this email already exists. Try signing in instead."
            : data.error === "password_mismatch"
              ? "The passwords do not match."
              : data.error === "weak_password"
                ? "Your password must be at least 12 characters."
                : data.error === "too_many_attempts"
                  ? "Too many registration attempts. Please wait a while and try again."
                  : "We could not create your account. Check the form and try again.",
        );
        setBusy(false);
        return;
      }

      router.push("/login?registered=1");
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
    <div className="login-simple">
      <header className="login-simple-header">
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="register-title">
          <div className="login-card-logo">
            <img src="/assets/honore-logo-cropped.png" alt="I Honore Tax & Wealth" />
          </div>
          <span className="login-eyebrow">I HONORE TAX &amp; WEALTH</span>
          <h1 id="register-title">Create your account.</h1>
          <p className="login-intro">
            Register once and use the same account every tax year. Track your
            return, sign documents, and message the team from your client portal.
          </p>
          {agentName ? (
            <p className="login-preview-note" role="status">
              You selected <strong>{agentName}</strong> as your tax professional.
              You will be connected automatically.
            </p>
          ) : null}

          <form className="login-simple-form" onSubmit={onSubmit} noValidate>
            <label htmlFor="register-name">Full name</label>
            <input
              id="register-name"
              name="displayName"
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />

            <label htmlFor="register-email">Email address</label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <label htmlFor="register-phone">Phone <span className="login-optional">(optional)</span></label>
            <input
              id="register-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />

            <PasswordInput
              id="register-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              required
              disabled={busy}
            />

            <PasswordInput
              id="register-confirm"
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              placeholder="Repeat your password"
              required
              disabled={busy}
            />

            {error ? (
              <p className="login-preview-note" role="alert" id="register-error">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !valid}
              aria-describedby={error ? "register-error" : undefined}
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="login-preview-note">
            By registering you agree to our <a href="/terms">Terms</a> and{" "}
            <a href="/privacy">Privacy Policy</a>. Please do not submit sensitive
            tax information through the public consultation form — share
            documents securely inside your portal after signing in.
          </p>
          <a className="login-help" href="/login">Already have an account? Sign in</a>
          <a className="login-help" href="/contact">Need help? Contact our team</a>
        </section>
      </main>
    </div>
    <SiteFooter />
    </>
  );
}

export default function Register() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
