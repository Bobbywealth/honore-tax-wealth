import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, LockKeyhole, MessageSquareText } from "lucide-react";
import DashboardShell from "../DashboardShell";

export default function ClientDashboard() {
  return (
    <DashboardShell audience="Client" title="Your tax home" description="A clear place to see what comes next in your tax preparation.">
      <div className="dashboard-alert"><LockKeyhole size={20} /><p><strong>Secure account setup is in progress.</strong> This preview does not contain your tax information. Do not enter or upload sensitive documents here.</p></div>

      <div className="dashboard-grid">
        <section className="dashboard-section dashboard-primary" id="next-steps">
          <div className="dashboard-section-head"><span className="dashboard-eyebrow">GET STARTED</span><h2>Your next steps</h2></div>
          <ol className="dashboard-steps">
            <li><span>01</span><div><strong>Tell us what you need</strong><p>Request a consultation for individual filing, business taxes, or planning.</p></div><a href="/#contact" aria-label="Request a consultation"><ArrowUpRight size={20} /></a></li>
            <li><span>02</span><div><strong>Prepare for the conversation</strong><p>Review the general checklist before your appointment.</p></div><a href="/#prepare" aria-label="View preparation checklist"><ArrowUpRight size={20} /></a></li>
            <li><span>03</span><div><strong>Share documents securely</strong><p>Your advisor will provide instructions when secure document access is available.</p></div><LockKeyhole size={18} /></li>
          </ol>
          <a className="dashboard-button" href="/#contact">Request a consultation <ArrowUpRight size={18} /></a>
        </section>

        <section className="dashboard-section dashboard-status" id="activity">
          <div className="dashboard-section-head"><span className="dashboard-eyebrow">YOUR ACCOUNT</span><h2>At a glance</h2></div>
          <div className="dashboard-status-row"><FileText size={20} /><div><strong>Tax return</strong><span>Available after account setup</span></div></div>
          <div className="dashboard-status-row"><CalendarDays size={20} /><div><strong>Appointments</strong><span>No appointment shown in this preview</span></div></div>
          <div className="dashboard-status-row"><MessageSquareText size={20} /><div><strong>Messages</strong><span>Secure messaging is being prepared</span></div></div>
          <div className="dashboard-quiet"><CheckCircle2 size={18} /><span>Need help now? Contact the Honoré team through the consultation form.</span></div>
        </section>
      </div>
    </DashboardShell>
  );
}
