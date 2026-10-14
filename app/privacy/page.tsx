import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Honore Tax & Wealth collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#faf9f5", color: "#172435", fontFamily: "DM Sans, Inter, sans-serif", padding: "72px 24px 96px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#9a7642", textDecoration: "none", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 700, marginBottom: 24 }}>
          ← Back to home
        </Link>
        <h1 style={{ font: "400 48px/1.1 Georgia, serif", letterSpacing: "-.03em", margin: "0 0 16px" }}>Privacy Policy</h1>
        <p style={{ color: "#5b6c78", fontSize: 14, marginBottom: 32 }}>Last updated October 4, 2026</p>

        <Section title="1. Who we are">
          Honore Tax & Wealth ("Honore", "we", "us") is a tax preparation and advisory practice. This policy explains what information we collect when you use this website, how we use it, and the choices you have.
        </Section>

        <Section title="2. What we collect">
          <p>On this site you can submit a consultation request. We collect only what you choose to provide:</p>
          <ul>
            <li>Name, email, phone number</li>
            <li>The service you are asking about (for example, individual tax preparation or IRS notice help)</li>
            <li>A free-form message you choose to include</li>
          </ul>
          <p>We do not request, and you should not submit, Social Security numbers, account numbers, prior tax returns, or any other sensitive tax documents through this website. Use only a secure method provided by your Honore preparer for that information.</p>
        </Section>

        <Section title="3. What we don't collect through this site">
          <p>This site is for marketing and consultation intake only. It does not host the secure client portal, does not accept document uploads, and does not store taxpayer records. The client login is a preview and does not yet transmit or store any personal tax information.</p>
        </Section>

        <Section title="4. How we use the information">
          <p>We use consultation requests to respond to your inquiry, recommend the right service, and follow up. We do not sell, rent, or share your contact information with third parties for their marketing. We may share with a service provider that helps us run our practice (for example, our scheduling or email tools), and only the minimum needed to do that job.</p>
        </Section>

        <Section title="5. Cookies and analytics">
          <p>Honore uses only cookies that are strictly necessary to keep the site working. We do not set tracking or advertising cookies and we do not use third-party analytics that profile visitors.</p>
        </Section>

        <Section title="6. How long we keep it">
          <p>Consultation requests are kept as long as you remain an active prospect or client, plus a reasonable retention period for tax recordkeeping (up to seven years from the date of the last service), or as required by law.</p>
        </Section>

        <Section title="7. Your choices">
          <p>You can ask us to correct, export, or delete the information you sent us. Email <a href="mailto:ihonoretaxwealth@gmail.com" style={{ color: "#9a7642" }}>ihonoretaxwealth@gmail.com</a> and we will respond within 30 days.</p>
        </Section>

        <Section title="8. Security">
          <p>Submission traffic is encrypted in transit (HTTPS). We limit who at Honore can see consultation requests. Tax documents are never accepted through this site. Once the secure client portal is available, it will require multi-factor authentication for staff and encrypted document storage.</p>
        </Section>

        <Section title="9. Children's privacy">
          <p>This site is not directed to children under 13, and we do not knowingly collect personal information from them.</p>
        </Section>

        <Section title="10. Changes">
          <p>We will post updates to this page with a revised "Last updated" date. Material changes will be communicated through the site or by email if you are a current client.</p>
        </Section>

        <Section title="11. Contact">
          <p>
            Honore Tax & Wealth<br />
            Phone: <a href="tel:+14073407964" style={{ color: "#9a7642" }}>407-340-7964</a><br />
            Email: <a href="mailto:ihonoretaxwealth@gmail.com" style={{ color: "#9a7642" }}>ihonoretaxwealth@gmail.com</a>
          </p>
        </Section>

        <Section title="12. Regulatory context">
          <p>Honore is a tax preparation firm. We maintain a Written Information Security Plan (WISP) consistent with IRS Publication 4557 and the FTC Safeguards Rule. Once the secure client portal is live, the additional controls required for handling taxpayer records (multi-factor authentication, encryption, audit logs, retention, backup, and disposal) will be described in the portal's own terms.</p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ font: "500 22px/1.3 Georgia, serif", letterSpacing: "-.01em", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#3a4855" }}>{children}</div>
      <style>{`
        section ul { margin: 8px 0 8px 22px; }
        section li { margin-bottom: 6px; }
        section p { margin: 8px 0; }
      `}</style>
    </section>
  );
}
