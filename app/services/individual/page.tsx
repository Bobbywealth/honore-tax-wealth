import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Personal Tax Preparation",
  description:
    "Individual tax preparation for W-2, 1099, self-employment, and family changes. Honoré Tax & Wealth helps you file with confidence.",
  alternates: { canonical: "/services/individual" },
};

const pageStyle = {
  minHeight: "100vh",
  background: "#faf9f5",
  color: "#172435",
  fontFamily: "DM Sans, Inter, sans-serif",
  padding: "72px 24px 96px",
} as const;
const wrap = { maxWidth: 760, margin: "0 auto" } as const;
const gold = { color: "#9a7642", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" as const, fontWeight: 700 };
const h1 = { font: "400 48px/1.1 Georgia, serif", letterSpacing: "-0.03em", margin: "0 0 16px" } as const;
const p = { color: "#5b6c78", fontSize: 15, lineHeight: 1.7, margin: "0 0 14px" } as const;

export default function IndividualServicePage() {
  return (
    <main style={pageStyle}>
      <div style={wrap}>
        <Link href="/" style={{ ...gold, display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
          ← Back to home
        </Link>

        <h1 style={h1}>Personal tax preparation.</h1>
        <p style={{ ...p, fontSize: 17 }}>
          Whether you have W-2 income, self-employment earnings, or major life changes to account
          for, we help you file accurately and with confidence.
        </p>

        <h2 style={{ ...h1, fontSize: 32, marginTop: 40 }}>Common situations we help with</h2>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>W-2 income from one or multiple employers</li>
          <li style={{ marginBottom: 8 }}>Self-employment or side-gig income (1099)</li>
          <li style={{ marginBottom: 8 }}>Major life changes: marriage, children, home purchase</li>
          <li style={{ marginBottom: 8 }}>Investment income, dividends, capital gains</li>
          <li style={{ marginBottom: 8 }}>Itemized deductions and credits</li>
          <li>Prior-year adjustments or amended returns</li>
        </ul>

        <div style={{ marginTop: 40, padding: "28px", border: "1px solid #e8e2d5", borderRadius: 14, background: "#fff" }}>
          <h2 style={{ ...h1, fontSize: 26, marginBottom: 12 }}>Ready to start?</h2>
          <p style={p}>
            Tell us a bit about your situation and we'll confirm the scope, timeline, and what to
            have ready before your first appointment.
          </p>
          <button
            type="button"
            data-open-consultation
            data-service="Individual tax preparation"
            style={{
              display: "inline-block",
              padding: "14px 24px",
              borderRadius: 8,
              background: "#0b1a2a",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              border: 0,
              cursor: "pointer",
            }}
          >
            REQUEST A CONSULTATION
          </button>
        </div>

        <p style={{ ...p, marginTop: 32 }}>
          <Link href="/about" style={{ color: "#9a7642" }}>Meet the founders</Link> ·{" "}
          <Link href="/contact" style={{ color: "#9a7642" }}>Contact</Link> ·{" "}
          <Link href="/" style={{ color: "#9a7642" }}>Return home</Link>
        </p>
      </div>
    </main>
  );
}
