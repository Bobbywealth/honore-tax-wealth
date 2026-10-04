import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { ArrowUpRight, Inbox, LockKeyhole, Users } from "lucide-react";
import DashboardShell from "../DashboardShell";

export const dynamic = "force-dynamic";

type Inquiry = { id: number; name: string; email: string; phone: string; service: string; message: string; created_at: string };
const ownerId = "8ab18a5e-4d89-4089-b8bb-833ee47c7714";

export default async function AdminDashboard({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const requestHeaders = await headers();
  const params = searchParams ? await searchParams : {};
  const preview = params.preview === "1";
  if (!preview && requestHeaders.get("oai-authenticated-user-id") !== ownerId) {
    return <main className="dashboard-restricted"><LockKeyhole size={32} /><h1>Access restricted</h1><p>This dashboard is available to the site owner.</p><a href="/login">Back to portal</a></main>;
  }

  let inquiries: Inquiry[] = [];
  let unavailable = false;
  try {
    if (!preview) {
      const result = await env.DB.prepare("SELECT id,name,email,phone,service,message,created_at FROM consultations ORDER BY id DESC LIMIT 20").all<Inquiry>();
      inquiries = result.results || [];
    }
  } catch (error) {
    console.error("Admin dashboard could not load inquiries", error);
    unavailable = true;
  }

  return (
    <DashboardShell audience="Admin" title="Practice overview" description="Keep consultation requests in view and follow up with confidence.">
      <div className="dashboard-alert"><LockKeyhole size={20} /><p><strong>{preview ? "Preview mode." : "Owner access."}</strong> {preview ? "This is a safe preview of the admin workspace. Live consultation requests remain protected until owner sign-in is connected." : "Consultation requests below are live. Client cases, files, and team roles will appear when the secure workspace is connected."}</p></div>
      <div className="dashboard-stat-grid">
        <div><span>RECENT REQUESTS</span><strong>{unavailable ? "—" : inquiries.length}</strong><small>Latest 20 inquiries</small></div>
        <div><span>CLIENT CASES</span><strong>—</strong><small>Case tracking coming soon</small></div>
        <div><span>SECURE DOCUMENTS</span><strong>—</strong><small>Uploads not yet enabled</small></div>
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-section dashboard-primary" id="activity">
          <div className="dashboard-section-head"><span className="dashboard-eyebrow">LIVE INBOX</span><h2>Consultation requests</h2></div>
          {unavailable ? <p className="dashboard-empty">Requests are temporarily unavailable. Please check again shortly.</p> :
            inquiries.length === 0 ? <div className="dashboard-empty"><Inbox size={28} /><strong>No requests yet</strong><p>New consultation inquiries will appear here.</p></div> :
            <div className="dashboard-inquiries">{inquiries.map((item) => (
              <article key={item.id}>
                <div><strong>{item.name}</strong><span>{item.service}</span></div>
                <p>{item.message || "No additional message"}</p>
                <footer><time>{new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time><a href={`mailto:${item.email}`}>Reply <ArrowUpRight size={16} /></a></footer>
              </article>
            ))}</div>}
        </section>
        <section className="dashboard-section dashboard-status" id="next-steps">
          <div className="dashboard-section-head"><span className="dashboard-eyebrow">WORKSPACE</span><h2>Coming next</h2></div>
          <div className="dashboard-status-row"><Users size={20} /><div><strong>Client records</strong><span>Profiles and tax preparation stages</span></div></div>
          <div className="dashboard-status-row"><LockKeyhole size={20} /><div><strong>Secure documents</strong><span>Private upload and review workflow</span></div></div>
          <a className="dashboard-text-link" href="/inquiries">Open full request list <ArrowUpRight size={17} /></a>
        </section>
      </div>
    </DashboardShell>
  );
}
