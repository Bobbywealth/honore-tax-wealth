import { Phone, Video, MoreHorizontal, Paperclip, Send, Mail, Calendar, FileText, Tag } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth.tsx";

export const dynamic = "force-dynamic";

const conversations = [
  { id: 1, name: "Marcus Taylor", initials: "MT", tone: "red", service: "Small business tax planning", preview: "Following up on our consultation from yesterday — should I send my Q3 books over now or wait?", time: "2m", unread: true, status: "Consultation" },
  { id: 2, name: "Lena Rivera", initials: "LR", service: "1040 individual with Sch C", preview: "Uploaded my W-2s, anything else you need from me this week?", time: "12m", unread: true, status: "Active client" },
  { id: 3, name: "David Park", initials: "DP", tone: "bl", service: "Back taxes resolution", preview: "Thanks for the call earlier. The 2020 transcripts should be ready Friday.", time: "1h", unread: true, status: "Active client" },
  { id: 4, name: "Sharon Kim", initials: "SK", tone: "gn", service: "Joint return 2025", preview: "Engagement letter signed and returned. Ready to proceed on the prep.", time: "3h", status: "Engagement signed" },
  { id: 5, name: "Priya Hassan", initials: "PH", service: "1065 partnership return", preview: "Filed — confirmation ACK 1040X2025. Will follow up next week on K-1 distribution.", time: "Yesterday", status: "Filed" },
  { id: 6, name: "Jordan Whitlock", initials: "JW", service: "K-1 prep, 1120-S", preview: "Got the 1099-DIV, will upload by tomorrow morning.", time: "Yesterday", status: "Documents pending" },
  { id: 7, name: "Aanya Patel", initials: "AP", service: "1120-S partnership", preview: "Quick question about depreciation on the new equipment — what schedule should we use?", time: "Mon", status: "Active client" },
  { id: 8, name: "Ramon Castillo", initials: "RC", service: "1040 with Schedule C", preview: "Spoke with my bookkeeper, the home office sqft is 180 not 220. Updating now.", time: "Sun", status: "Active client" },
];

const messages = [
  { who: "in", name: "Marcus Taylor", text: "Hi Bobby — thanks for taking my call yesterday. I've been going back through Q2 and Q3 and want to make sure we capture the home office deduction right before sending the 1065 over.", when: "Yesterday 3:42 PM" },
  { who: "out", name: "You", text: "Absolutely. Send me the depreciation schedule and the square footage of the dedicated office space and I'll model both options. We have until Oct 15 to file the extension if we need more time.", when: "Yesterday 4:15 PM" },
  { who: "in", name: "Marcus Taylor", text: "Perfect. One more thing — should I have my bookkeeper roll the Q3 estimated payments into the extension, or pay them separately this month?", when: "Today 9:58 AM" },
  { who: "out", name: "You", text: "Pay them separately. If we extend 1065 we still owe the Q3 estimates. I'll send the payment vouchers this afternoon.", when: "Today 10:24 AM" },
  { who: "in", name: "Marcus Taylor", text: "Following up on our consultation from yesterday — should I send my Q3 books over now or wait?", when: "Today 1:46 PM" },
];

export default async function InboxPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/inbox">
      <div className="adm-page-h">
        <div>
          <h1>Inbox</h1>
          <div className="sub">8 conversations · 3 unread · 1 reply needed today</div>
        </div>
        <button className="adm-btn"><Mail size={13} /> New message</button>
      </div>

      <div className="adm-inbox">
        <div className="adm-inbox-list">
          <div className="adm-inbox-search"><input placeholder="Search messages…" /></div>
          {conversations.map((c) => (
            <div key={c.id} className={`adm-inbox-i${c.id === 1 ? " active" : ""}`}>
              <div className={`av${c.tone ? " " + c.tone : ""}`}>{c.initials}</div>
              <div className="body">
                <div className="meta-row">
                  <b>{c.name}</b>
                  <span className="time">{c.time}</span>
                </div>
                <div className="preview">{c.preview}</div>
                <div className="meta-row">
                  <span className="adm-tag am">{c.status}</span>
                  {c.unread ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d4a755" }} /> : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="adm-inbox-thread">
          <div className="adm-inbox-thread-head">
            <div className="av red">MT</div>
            <div style={{ flex: 1 }}>
              <b>Marcus Taylor</b>
              <div className="sm">Small business tax planning · Active 2h ago</div>
            </div>
            <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}><Phone size={13} /> Call</button>
            <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}><Calendar size={13} /> Schedule</button>
            <button style={{ background: "transparent", border: 0, color: "#7a858e", cursor: "pointer" }}><MoreHorizontal size={18} /></button>
          </div>
          <div className="adm-inbox-thread-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`adm-msg ${m.who}`}>
                <div className={`who ${m.who}`}>{m.name}</div>
                <div>{m.text}</div>
                <div className="when">{m.when}</div>
              </div>
            ))}
          </div>
          <div className="adm-inbox-composer">
            <button style={{ background: "transparent", border: 0, color: "#7a858e", cursor: "pointer" }}><Paperclip size={16} /></button>
            <input placeholder="Reply to Marcus…" />
            <button className="adm-btn" style={{ padding: "8px 14px" }}><Send size={13} /> Send</button>
          </div>
        </div>

        <div className="adm-inbox-side">
          <h4>Client</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="av red" style={{ width: 44, height: 44, fontSize: 14 }}>MT</div>
            <div>
              <b style={{ fontSize: 14, fontWeight: 600, color: "#0e1a26", display: "block" }}>Marcus Taylor</b>
              <span style={{ fontSize: 11, color: "#7a858e" }}>Active client · 3 returns</span>
            </div>
          </div>
          <div className="kv"><span>Email</span><b>marcus@hale-co.com</b></div>
          <div className="kv"><span>Phone</span><b>+1 (973) 555-0142</b></div>
          <div className="kv"><span>Service</span><b>1065 · S-Corp</b></div>
          <div className="kv"><span>Owner</span><b>Bobby</b></div>
          <div className="kv"><span>Last touch</span><b>2h ago</b></div>
          <div className="kv"><span>Lifetime fee</span><b>$4,820</b></div>

          <h4 style={{ marginTop: 18 }}>Active returns</h4>
          <div style={{ fontSize: 12, padding: "7px 0", borderBottom: "1px solid #efece3" }}>
            <b style={{ color: "#0e1a26" }}>1065 · TY 2024</b>
            <div style={{ color: "#9a7a2e", fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>IN PREP</div>
          </div>
          <div style={{ fontSize: 12, padding: "7px 0", borderBottom: "1px solid #efece3" }}>
            <b style={{ color: "#0e1a26" }}>1120-S · TY 2024</b>
            <div style={{ color: "#2a5d8f", fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>REVIEW</div>
          </div>

          <h4 style={{ marginTop: 18 }}>Shared files</h4>
          <div className="file-row"><div className="ic">PDF</div><div style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 11.5 }}>Q3_PL.pdf</b><span style={{ fontSize: 10, color: "#7a858e" }}>2h ago</span></div></div>
          <div className="file-row"><div className="ic" style={{ background: "#2f7a52" }}>XLS</div><div style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 11.5 }}>Depreciation.xls</b><span style={{ fontSize: 10, color: "#7a858e" }}>Yesterday</span></div></div>

          <h4 style={{ marginTop: 18 }}>Tags</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="adm-tag bl">1065</span>
            <span className="adm-tag am">VIP</span>
            <span className="adm-tag gn">Q3 est</span>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
