import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tax Planning",
  description:
    "Tax planning ahead of tax season. Understand what changed, what may be coming, and the questions to ask your preparer before filing.",
  alternates: { canonical: "/services/planning" },
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

export default function TaxPlanningPage() {
  return (
    <main style={pageStyle}>
      <div style={wrap}>
        <Link href="/" style={{ ...gold, display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
          ← Back to home
        </Link>

        <h1 style={h1}>Tax planning.</h1>
        <p style={{ ...p, fontSize: 17 }}>
          Tax season moves faster when you've already thought it through. A planning conversation now
          means fewer surprises at filing time — and better outcomes all around.
        </p>

        <h2 style={{ ...h1, fontSize: 32, marginTop: 40 }}>Common planning conversations</h2>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Significant change in income from the prior year</li>
          <li style={{ marginBottom: 8 }}>Starting a new business or side gig</li>
          <li style={{ marginBottom: 8 }}>Estimated tax payments — do you need to make them?</li>
          <li style={{ marginBottom: 8 }}>Retirement contributions, HSA, or FSA strategy</li>
          <li style={{ marginBottom: 8 }}>Charitable giving and itemized vs. standard deduction</li>
          <li>Changes in filing status, dependents, or household</li>
        </ul>

        <div style={{ marginTop: 40, padding: "28px", border: "1px solid #e8e2d5", borderRadius: 14, background: "#fff" }}>
          <h2 style={{ ...h1, fontSize: 26, marginBottom: 12 }}>Ready to plan ahead?</h2>
          <p style={p}>
            Start with a consultation and we'll talk through what's changed and what to watch for.
          </p>
          <button
            type="button"
            data-open-consultation
            data-service="Tax planning"
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
