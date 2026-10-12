import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Website Disclaimer & Terms",
  description: "Terms of use for the Honore Tax & Wealth website and the limits of what this site does.",
};

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#faf9f5", color: "#172435", fontFamily: "DM Sans, Inter, sans-serif", padding: "72px 24px 96px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#9a7642", textDecoration: "none", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 700, marginBottom: 24 }}>
          ← Back to home
        </Link>
        <h1 style={{ font: "400 48px/1.1 Georgia, serif", letterSpacing: "-.03em", margin: "0 0 16px" }}>Website Disclaimer & Terms</h1>
        <p style={{ color: "#5b6c78", fontSize: 14, marginBottom: 32 }}>Last updated October 4, 2026</p>

        <Section title="1. Not tax advice">
          <p>Nothing on this site is tax, legal, or investment advice. The content is general information about the tax preparation, filing, and planning services Honore offers. Your situation is unique; please talk with a qualified preparer or adviser before acting on anything you read here.</p>
        </Section>

        <Section title="2. No client relationship from this site">
          <p>Submitting a consultation request, browsing the site, or reading the information here does not create a preparer–client relationship. A relationship begins only when you and Honore sign an engagement letter and Honore begins work.</p>
        </Section>

        <Section title="3. Do not send sensitive information">
          <p>Do not submit Social Security numbers, account numbers, prior tax returns, or other sensitive tax documents through the consultation form, the contact form, or any general message on this site. Use only the secure method Honore provides to you once a preparer–client relationship is established.</p>
        </Section>

        <Section title="4. Eligibility and use">
          <p>You must be at least 18 years old to submit a consultation request. You agree to provide accurate information and not to use the site to harass, impersonate, or interfere with the service.</p>
        </Section>

        <Section title="5. Estimates and fee information">
          <p>Any fee ranges, service descriptions, or turnaround times shown on the site are for general information and may change once Honore reviews your specific situation.</p>
        </Section>

        <Section title="6. Intellectual property">
          <p>The site content, branding, and design are owned by Honore or used with permission. You may view and print pages for personal reference. You may not reproduce, republish, or sell any portion without written permission.</p>
        </Section>

        <Section title="7. Third-party links">
          <p>The site may link to third-party resources (for example, the IRS). We don't control those sites and aren't responsible for their content or availability.</p>
        </Section>

        <Section title="8. No warranties">
          <p>The site is provided "as is" and "as available." We don't promise that it will be uninterrupted, error-free, or free of harmful components. We may change or stop the site at any time.</p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>To the maximum extent permitted by law, Honore isn't liable for any indirect, incidental, or consequential damages arising from your use of this site. Nothing in these terms limits any liability that cannot be excluded by law.</p>
        </Section>

        <Section title="10. Indemnification">
          <p>You agree to indemnify Honore against claims arising from information you submit through the site in violation of these terms or applicable law.</p>
        </Section>

        <Section title="11. Governing law">
          <p>These terms are governed by the laws of the State of New Jersey, without regard to conflict-of-laws rules. Any dispute will be resolved in the state or federal courts located in New Jersey.</p>
        </Section>

        <Section title="12. Changes">
          <p>We may update these terms from time to time. The "Last updated" date above will reflect the latest revision. Continued use of the site after a change means you accept the updated terms.</p>
        </Section>

        <Section title="13. Contact">
          <p>Questions about these terms can be sent to <a href="mailto:office@honore-tax.com" style={{ color: "#9a7642" }}>office@honore-tax.com</a>.</p>
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
