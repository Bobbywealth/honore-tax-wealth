import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

function OctoberDays() {
  const cells: Array<{ d: number; muted?: boolean; today?: boolean; evs?: Array<{ t: string; tone?: "red" }> }> = [
    { d: 28, muted: true }, { d: 29, muted: true }, { d: 30, muted: true },
    { d: 1, evs: [{ t: "Standup" }, { t: "M. Taylor call" }] },
    { d: 2, evs: [{ t: "Rivera prep" }] },
    { d: 3, evs: [{ t: "Park review" }] },
    { d: 4, today: true, evs: [{ t: "Inbox 3 new" }, { t: "EOD triage" }] },
    { d: 5, evs: [{ t: "Whitlock K-1" }] },
    { d: 6, evs: [{ t: "Hassan 1065 prep" }] },
    { d: 7 },
    { d: 8 },
    { d: 9 },
    { d: 10, evs: [{ t: "Castillo call" }] },
    { d: 11 },
    { d: 12 },
    { d: 13, evs: [{ t: "Mitchell Q3" }] },
    { d: 14, evs: [{ t: "Patel partner" }] },
    { d: 15, evs: [{ t: "EXTENSION DEADLINE", tone: "red" }, { t: "Hassan 7004" }] },
    { d: 16 },
    { d: 17 },
    { d: 18 },
    { d: 19 },
    { d: 20 },
    { d: 21, evs: [{ t: "Okafor followup" }] },
    { d: 22 },
    { d: 23, evs: [{ t: "Newsletter send" }] },
    { d: 24 },
    { d: 25 },
    { d: 26 },
    { d: 27, evs: [{ t: "Standup" }] },
    { d: 28 },
    { d: 29, evs: [{ t: "Quarterly est." }] },
    { d: 30 },
    { d: 31 },
    { d: 1, muted: true },
  ];
  return cells.map((c, i) => (
    <div key={i} className={`adm-cal-cell${c.muted ? " muted" : ""}${c.today ? " today" : ""}`}>
      <div className="n">{c.d}</div>
      {c.evs?.slice(0, 2).map((e, j) => (
        <div key={j} className={`ev${e.tone ? " " + e.tone : ""}`}>{e.t}</div>
      ))}
    </div>
  ));
}

const upcoming = [
  { time: "10:30 AM", title: "Call Marcus Taylor", sub: "Discovery · 30 min", tag: "Today" },
  { time: "1:00 PM", title: "Review Rivera 1040", sub: "Schedule C sign-off", tag: "Today" },
  { time: "Wed 11:00", title: "File Hassan 1065 extension", sub: "Form 7004 · $3,420", tag: "This week" },
  { time: "Oct 15", title: "Extension filing deadline", sub: "2 returns at risk", tag: "Deadline" },
  { time: "Oct 23", title: "Newsletter — Q4 tax moves", sub: "Drafts in shared drive", tag: "This month" },
  { time: "Jan 15", title: "Q4 estimated payments", sub: "Reminder: 5 clients need vouchers", tag: "Q1 2027" },
];

export default async function CalendarPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/calendar">
      <div className="adm-page-h">
        <div>
          <h1>Calendar</h1>
          <div className="sub">5 events this week · 1 deadline in 11 days · 6 upcoming across 3 months</div>
        </div>
        <button className="adm-btn"><Plus size={13} /> New event</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div className="adm-cal-full">
          <h3>
            October 2026
            <div className="nav">
              <button><ChevronLeft size={14} /></button>
              <button style={{ width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".5px" }}>TODAY</button>
              <button><ChevronRight size={14} /></button>
            </div>
          </h3>
          <div className="adm-cal-grid-full">
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>SUN</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>MON</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>TUE</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>WED</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>THU</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>FRI</div>
            <div className="adm-cal-d" style={{ fontSize: 10, fontWeight: 700, color: "#7a858e", letterSpacing: 1, textAlign: "center", padding: "4px 0" }}>SAT</div>
            <OctoberDays />
          </div>
        </div>

        <div className="adm-card">
          <h3>Upcoming <a>View all →</a></h3>
          {upcoming.map((u, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? 0 : "1px solid #efece3", alignItems: "flex-start" }}>
              <div style={{ minWidth: 64, font: "500 11px Fraunces, Georgia, serif", color: "#9a7a2e", textAlign: "right" }}>{u.time}</div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 12.5, fontWeight: 600, color: "#0e1a26", display: "block" }}>{u.title}</b>
                <div className="adm-sm" style={{ marginTop: 2 }}>{u.sub}</div>
                <span className={`adm-tag ${u.tag === "Deadline" ? "rd" : u.tag === "Today" ? "am" : "bl"}`} style={{ marginTop: 6 }}>{u.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
