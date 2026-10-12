import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet the founders behind Honore Tax & Wealth, and how a tax engagement actually works.",
  alternates: { canonical: "/about" },
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
const h2 = { font: "400 30px/1.2 Georgia, serif", letterSpacing: "-0.02em", margin: "48px 0 12px" } as const;
const p = { color: "#5b6c78", fontSize: 15, lineHeight: 1.7, margin: "0 0 14px" } as const;

export default function AboutPage() {
  return (
    <main style={page}>
      <div style={wrap}>
        <Link href="/" style={{ ...gold, display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
          ← Back to home
        </Link>

        <h1 style={h1}>About Honore.</h1>
        <p style={{ ...p, fontSize: 17, marginBottom: 8 }}>
          Honore Tax &amp; Wealth is a tax company focused on preparation, filing, and planning for
          individuals, families, and business owners.
        </p>

        <h2 style={h2}>The founders</h2>
        <p style={p}>
          Honore was founded by John Joseph and Sade Joseph. They are the personal side of the
          practice — a relationship built on care, purpose, and looking ahead together.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", margin: "28px 0 8px" }}>
          <figure style={{ margin: 0 }}>
            <Image
              src="/assets/founder-brown.webp"
              alt="John Joseph, Honore founder in a brown suit"
              width={640}
              height={800}
              style={{ width: "100%", height: "auto", borderRadius: 12, display: "block" }}
            />
            <figcaption style={{ ...gold, marginTop: 12 }}>
              John Joseph — Co-founder
            </figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <Image
              src="/assets/founder-navy.webp"
              alt="Sade Joseph, Honore founder in a navy suit"
              width={640}
              height={800}
              style={{ width: "100%", height: "auto", borderRadius: 12, display: "block" }}
            />
            <figcaption style={{ ...gold, marginTop: 12 }}>
              Sade Joseph — Co-founder
            </figcaption>
          </figure>
        </div>

        <h2 style={h2}>It&rsquo;s bigger than a return</h2>
        <p style={p}>
          There&rsquo;s a person behind every number, a story behind every business, and a plan behind
          every next chapter. We bring care and clarity to tax preparation, filing, and forward-looking
          conversations, so you can make your next decision with confidence.
        </p>

        <h2 style={h2}>How an engagement works</h2>
        <ol style={{ ...p, paddingLeft: 20, margin: "0 0 14px" }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Tell us what you need.</strong> Share your tax situation through a short
            consultation request. No sensitive documents are needed in the message.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Clarify the scope.</strong> We discuss the help you need and what information will
            be useful to move forward.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Prepare with purpose.</strong> Once the work is agreed, gather the relevant
            records and work through the details with your preparer.
          </li>
          <li>
            <strong>Review before filing.</strong> Review the return, ask questions, and approve it
            before submission. Then look ahead to what comes next.
          </li>
        </ol>

        <h2 style={h2}>What we help with</h2>
        <ul style={{ ...p, paddingLeft: 20, margin: "0 0 14px" }}>
          <li style={{ marginBottom: 6 }}>Individual tax preparation and filing</li>
          <li style={{ marginBottom: 6 }}>Business tax filing for small businesses and owners</li>
          <li style={{ marginBottom: 6 }}>Tax planning ahead of tax season</li>
          <li>IRS notice help — understanding a letter and what to do next</li>
        </ul>

        <div
          style={{
            marginTop: 40,
            padding: "24px 26px",
            border: "1px solid #e8e2d5",
            borderLeft: "3px solid #c7a569",
            borderRadius: 10,
            background: "#fff",
          }}
        >
          <strong style={{ display: "block", marginBottom: 6 }}>Please keep documents to yourself.</strong>
          <p style={{ ...p, margin: 0 }}>
            Do not send tax forms, Social Security numbers, or other sensitive documents through the
            consultation form. Your preparer will provide a secure method when the time comes. See our{" "}
            <Link href="/privacy" style={{ color: "#9a7642" }}>privacy policy</Link>.
          </p>
        </div>

        <p style={{ ...p, marginTop: 32 }}>
          <Link href="/contact" style={{ color: "#9a7642" }}>Contact the team</Link> or{" "}
          <Link href="/" style={{ color: "#9a7642" }}>return home</Link>.
        </p>
      </div>
    </main>
  );
}