import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Start a consultation with Honore Tax & Wealth. Tell us what you need and we will confirm the right next step.",
  alternates: { canonical: "/contact" },
};

const page = {
  minHeight: "100vh",
  background: "#faf9f5",
  color: "#172435",
  fontFamily: "DM Sans, Inter, sans-serif",
  padding: "72px 24px 96px",
} as const;
const wrap = { maxWidth: 760, margin: "0 auto" } as const;
const gold = { color: "#9a7642", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" as const, fontWeight: 700 };
const h1 = { font: "400 48px/1.1 Georgia, serif", letterSpacing: "-0.03em", margin: "0 0 16px" } as const;
const h2 = { font: "400 26px/1.2 Georgia, serif", letterSpacing: "-0.02em", margin: "40px 0 12px" } as const;
const p = { color: "#5b6c78", fontSize: 15, lineHeight: 1.7, margin: "0 0 14px" } as const;

export default function ContactPage() {
  return (
    <main style={page}>
      <div style={wrap}>
        <Link href="/" style={{ ...gold, display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
          ← Back to home
        </Link>

        <h1 style={h1}>Contact us.</h1>
        <p style={{ ...p, fontSize: 17 }}>
          Tell us what you&rsquo;re working through. We&rsquo;ll start with a conversation about the right
          tax service and next steps.
        </p>

        {/* The consultation form is the verified, working contact channel.
            Phone, address and business hours are deliberately absent because
            they are not confirmed business facts yet, and publishing
            placeholder contact details is worse than publishing none. */}
        <div
          style={{
            marginTop: 32,
            padding: "28px 28px",
            border: "1px solid #e8e2d5",
            borderRadius: 14,
            background: "#fff",
          }}
        >
          <h2 style={{ ...h2, marginTop: 0 }}>Request a consultation</h2>
          <p style={p}>
            The consultation form on our home page is the fastest way to reach us. You only need contact details and a short description of your situation — no tax documents.
          </p>
          <Link
            href="/#consultation"
            style={{
              display: "inline-block",
              padding: "14px 24px",
              borderRadius: 8,
              background: "#0b1a2a",
              color: "#fff",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            OPEN THE CONSULTATION FORM
          </Link>
        </div>

        <h2 style={h2}>Already a client?</h2>
        <p style={p}>
          Sign in to the client portal for your documents, messages, and engagement status.
        </p>
        <p style={p}>
          <Link href="/login" style={{ color: "#9a7642" }}>Go to client sign in</Link>
        </p>

        <h2 style={h2}>What to expect</h2>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}>
            A consultation request is a request, not a booked appointment. We confirm the time and
            scope with you directly.
          </li>
          <li style={{ marginBottom: 6 }}>
            Please leave out Social Security numbers, tax forms, and identification numbers in your
            message.
          </li>
          <li>
            Once your request is saved, the confirmation page explains the next step.
          </li>
        </ul>

        <h2 style={h2}>Prefer to browse first?</h2>
        <p style={p}>
          <Link href="/about" style={{ color: "#9a7642" }}>About Honore</Link> ·{" "}
          <Link href="/privacy" style={{ color: "#9a7642" }}>Privacy policy</Link> ·{" "}
          <Link href="/terms" style={{ color: "#9a7642" }}>Terms</Link>
        </p>
      </div>
    </main>
  );
}