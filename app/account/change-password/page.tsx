import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Change password | Honoré Tax & Wealth",
  description: "Update your account password.",
};

/**
 * Change-password screen for signed-in users (client + staff).
 * The client account menu links here; unsigned visitors are sent to /login.
 * Posts to the existing /api/auth/change-password route, which verifies the
 * current password, re-hashes, and revokes other sessions.
 */
export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account/change-password");

  return (
    <main className="login-simple" aria-label="Change password">
      <div className="login-simple-card">
        <h1>Change password</h1>
        <p className="login-simple-sub">
          Signed in as <strong>{user.email}</strong>
        </p>
        <ChangePasswordForm />
        <p className="login-simple-sub" style={{ marginTop: 18 }}>
          <a href="/dashboard" style={{ color: "#d9b878" }}>
            ← Back to dashboard
          </a>
        </p>
      </div>
    </main>
  );
}
