import { Plus, Filter } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth.tsx";

export const dynamic = "force-dynamic";

const today = [
  { title: "Call Marcus Taylor", sub: "Discovery · 30 min", due: "TODAY · 10:30", tone: "today", done: false },
  { title: "Review Rivera 1040", sub: "Schedule C · needs sign-off", due: "TODAY · 13:00", tone: "today", done: false },
  { title: "Request 1099s from J. Okafor", sub: "Outstanding 14 days", due: "TODAY", tone: "today", done: false },
  { title: "Approve Sharon Kim engagement", sub: "Awaiting countersign", due: "TODAY · 15:30", tone: "today", done: false },
  { title: "End-of-day triage", sub: "Clear inbox, plan tomorrow", due: "TODAY · 17:00", tone: "today", done: false },
];

const overdue = [
  { title: "Send K-1 request to J. Okafor", sub: "Was due Oct 1 · blocking 1065", due: "3 DAYS OVERDUE", tone: "overdue", done: false },
  { title: "Follow up on Patel depreciation", sub: "Awaiting Aanya's revision", due: "2 DAYS OVERDUE", tone: "overdue", done: false },
  { title: "Resend engagement to M. Hassan", sub: "Bounced email on file", due: "1 DAY OVERDUE", tone: "overdue", done: false },
];

const week = [
  { title: "Call Whitlock re: K-1 docs", sub: "Schedule 30-min slot", due: "TUE", tone: "today", done: false },
  { title: "Prep for Park 1040X review", sub: "Pull transcripts, prior return", due: "WED", tone: "today", done: false },
  { title: "File Hassan 1065 extension", sub: "Form 7004 · $3,420 fee", due: "WED", tone: "today", done: false },
  { title: "Quarterly newsletter draft", sub: "Top 5 tax moves for Q4", due: "THU", tone: "today", done: false },
  { title: "Hire interview — preparer", sub: "Aanya Cole, 2pm", due: "FRI", tone: "today", done: false },
  { title: "Review weekly reports", sub: "Revenue, turnaround, no-shows", due: "FRI", tone: "today", done: false },
];

const completed = [
  { title: "Standup with staff", sub: "Marcus, Sharon, David", due: "9:00 AM", tone: "today", done: true },
  { title: "Confirm Mitchell engagement", sub: "Signed and returned", due: "Yesterday", tone: "today", done: true },
  { title: "Wire Castillo retainer", sub: "$680 · invoice 1042", due: "Yesterday", tone: "today", done: true },
];

export default async function TasksPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/tasks">
      <div className="adm-page-h">
        <div>
          <h1>Tasks</h1>
          <div className="sub">5 due today · 3 overdue · 6 this week · 17 total open</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}><Filter size={13} /> Filter</button>
          <button className="adm-btn"><Plus size={13} /> New task</button>
        </div>
      </div>

      <div className="adm-tasks-cols">
        <div className="adm-tasks-col">
          <h3>Overdue <span className="ct">{overdue.length}</span></h3>
          {overdue.map((t, i) => <Task key={i} {...t} />)}
          <h3 style={{ marginTop: 18 }}>Today <span className="ct">{today.length}</span></h3>
          {today.map((t, i) => <Task key={i} {...t} />)}
        </div>
        <div className="adm-tasks-col">
          <h3>This week <span className="ct">{week.length}</span></h3>
          {week.map((t, i) => <Task key={i} {...t} />)}
        </div>
        <div className="adm-tasks-col">
          <h3>Completed <span className="ct">{completed.length}</span></h3>
          {completed.map((t, i) => <Task key={i} {...t} />)}
          <h3 style={{ marginTop: 18 }}>Delegated to staff</h3>
          <div style={{ background: "#fff", border: "1px solid rgba(14,26,38,.06)", borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 12 }}>
            <b>Sharon: prep Whitlock K-1</b>
            <div className="adm-sm" style={{ marginTop: 2 }}>Due Fri · 60% done</div>
            <div style={{ height: 4, background: "#f1ede2", borderRadius: 2, marginTop: 8 }}><div style={{ width: "60%", height: 4, background: "#2f8a5b", borderRadius: 2 }} /></div>
          </div>
          <div style={{ background: "#fff", border: "1px solid rgba(14,26,38,.06)", borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 12 }}>
            <b>David: collect Mitchell docs</b>
            <div className="adm-sm" style={{ marginTop: 2 }}>Due Tue · 30% done</div>
            <div style={{ height: 4, background: "#f1ede2", borderRadius: 2, marginTop: 8 }}><div style={{ width: "30%", height: 4, background: "#d4a755", borderRadius: 2 }} /></div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Task({ title, sub, due, tone, done }: { title: string; sub: string; due: string; tone: "today" | "overdue"; done: boolean }) {
  return (
    <div className={`adm-task${done ? " done" : ""}`}>
      <div className="chk" />
      <div className="adm-task-body">
        <b>{title}</b>
        <div className="sm">{sub}</div>
        <div className={`due ${tone}`}>{due}</div>
      </div>
    </div>
  );
}
