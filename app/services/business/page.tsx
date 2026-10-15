import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Business Tax Filing",
  description:
    "Business tax filing for small businesses and owners. iHonore Tax & Wealth handles 1040 Sch C, 1065, 1120-S and more.",
  alternates: { canonical: "/services/business" },
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

export default function BusinessServicePage() {
  return (
    <main style={pageStyle}>
      <div style={wrap}>
        <Link href="/" style={{ ...gold, display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
          ← Back to home
        </Link>

        <h1 style={h1}>Business tax filing.</h1>
        <p style={{ ...p, fontSize: 17 }}>
          Tax filing support shaped around your business structure and the records you have — from
          Schedule C sole proprietors to multi-member partnerships and S-corporations.
        </p>

        <h2 style={{ ...h1, fontSize: 32, marginTop: 40 }}>Business types we work with</h2>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Sole proprietors (Schedule C)</li>
          <li style={{ marginBottom: 8 }}>Partnerships (Form 1065)</li>
          <li style={{ marginBottom: 8 }}>S-Corporations (Form 1120-S)</li>
          <li style={{ marginBottom: 8 }}>Multi-member LLCs electing partnership or S-corp treatment</li>
          <li>K-1 preparation for partners and S-corp shareholders</li>
        </ul>

        <div style={{ marginTop: 40, padding: "28px", border: "1px solid #e8e2d5", borderRadius: 14, background: "#fff" }}>
          <h2 style={{ ...h1, fontSize: 26, marginBottom: 12 }}>Ready to start?</h2>
          <p style={p}>
            Tell us about your business and we'll confirm the scope, required records, and timeline.
          </p>
          <button
            type="button"
            data-open-consultation
            data-service="Business tax filing"
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
