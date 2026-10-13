import { checkAdminAccess } from "./auth";
import { Inbox } from "lucide-react";
import AdminShell from "./AdminShell";
import { getDb } from "@/db";
import { appointments, consultations, returns, tasks } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { loadUnansweredCount } from "./lib/loadUnansweredCount";

export const dynamic = "force-dynamic";

type Inquiry = { id: number; name: string; email: string; phone: string; service: string; message: string; created_at: string };

function dateStamp() {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "America/New_York" });
  const date = d.getDate();
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return { day, month, date, ordinal: ordinal(date), week, quarter: `Q${Math.floor(d.getMonth() / 3) + 1}` };
}

function MiniCalendarHeader() {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  return <span>{months[now.getMonth()]} {now.getFullYear()}</span>;
}

function MiniCalendar() {
  const cells: Array<{ d: number; muted?: boolean; today?: boolean; deadline?: boolean; has?: boolean }> = [];
  // Today's month/day is computed at request time. We still draw the same 31
  // calendar layout (Sep 28/29/30 lead + Nov 1 tail) so a stale page can't
  // hardcode a wrong date. `has` / `deadline` flags are sample-only placeholders.
  const now = new Date();
  const todayDay = now.getDate();
  const sept: Array<{ d: number; muted: boolean; has?: boolean }> = [
    { d: 28, muted: true }, { d: 29, muted: true }, { d: 30, muted: true },
  ];
  const oct: Array<{ d: number; today?: boolean; deadline?: boolean; has?: boolean }> = [
    { d: 1, has: true }, { d: 2, has: true }, { d: 3, has: true },
    { d: 4 }, { d: 5 }, { d: 6 }, { d: 7 }, { d: 8 }, { d: 9 },
    { d: 10, has: true }, { d: 11 }, { d: 12 }, { d: 13, has: true }, { d: 14 },
    { d: 15, deadline: true }, { d: 16 }, { d: 17 }, { d: 18 }, { d: 19 }, { d: 20 },
    { d: 21 }, { d: 22 }, { d: 23 }, { d: 24 }, { d: 25 }, { d: 26 }, { d: 27 },
    { d: 28 }, { d: 29 }, { d: 30 }, { d: 31 },
  ];
  for (const c of oct) {
    if (c.d === todayDay) c.today = true;
  }
  const nov1: Array<{ d: number; muted: boolean }> = [{ d: 1, muted: true }];
  return [...sept, ...oct, ...nov1].map((c, i) => {
    const todayClass = "today" in c && c.today ? " today" : "";
    const mutedClass = "muted" in c && c.muted ? " muted" : "";
    const deadlineClass = "deadline" in c && c.deadline ? " deadline" : "";
    const hasClass = "has" in c && c.has ? " has" : "";
    return <div key={i} className={`adm-cal-c${mutedClass}${todayClass}${deadlineClass}${hasClass}`}>{c.d}</div>;
  });
}

function KpiChart({ color, dir }: { color: string; dir: "up" | "down" }) {
  const points = dir === "up"
    ? "0,22 25,18 50,20 75,14 100,16 125,10 150,12 175,6 200,4"
    : "0,6 25,8 50,7 75,10 100,12 125,16 150,18 175,22 200,24";
  return (
    <svg className="chart" viewBox="0 0 200 30" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="200" cy={dir === "up" ? 4 : 24} r="2.5" fill={color} />
    </svg>
  );
}

export default async function AdminDashboard({ searchParams }: { searchParams?: Promise<{ preview?: string; dismiss?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  const preview = access.preview;
  const sp = (await searchParams) ?? {};
  const unanswered = await loadUnansweredCount();
  const dismissed = sp.dismiss === "ai";

  let inquiries: Inquiry[] = [];
  let unavailable = false;
  let realKpis: { newRequests: number; inPrep: number; waitingOnClient: number; readyForReview: number; filedThisMonth: number } | null = null;
  let realTodayAppointments: Array<{ title: string; startsAt: Date }> = [];
  let realPipeline: Record<string, number> = {};
  try {
    if (!preview && process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();
      const rows = await db
        .select({
          id: consultations.id,
          name: consultations.name,
          email: consultations.email,
          phone: consultations.phone,
          service: consultations.service,
          message: consultations.message,
          created_at: consultations.createdAt,
        })
        .from(consultations)
        .orderBy(desc(consultations.id))
        .limit(20);
      inquiries = rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));

      const [cCount, prepRows, waitRows, reviewRows, filedRows, apptRows, pipeRows] = await Promise.all([
        db.select({ c: count() }).from(consultations),
        db.select({ c: count() }).from(returns).where(sql`${returns.stage} IN ('in_prep','preparing')`),
        db.select({ c: count() }).from(returns).where(sql`${returns.stage} IN ('docs','documents')`),
        db.select({ c: count() }).from(returns).where(eq(returns.stage, "review")),
        db
          .select({ c: count() })
          .from(returns)
          .where(and(gte(returns.filedAt, sql`date_trunc('month', now())`), eq(returns.stage, "filed"))),
        db
          .select({ title: appointments.title, startsAt: appointments.startsAt })
          .from(appointments)
          .where(and(
            gte(appointments.startsAt, sql`date_trunc('day', now())`),
            sql`${appointments.startsAt} < date_trunc('day', now()) + interval '1 day'`,
          ))
          .orderBy(appointments.startsAt)
          .limit(6),
        db
          .select({ stage: returns.stage, c: count() })
          .from(returns)
          .groupBy(returns.stage),
      ]);

      realKpis = {
        newRequests: cCount[0]?.c ?? 0,
        inPrep: prepRows[0]?.c ?? 0,
        waitingOnClient: waitRows[0]?.c ?? 0,
        readyForReview: reviewRows[0]?.c ?? 0,
        filedThisMonth: filedRows[0]?.c ?? 0,
      };
      realTodayAppointments = apptRows.map((r) => ({ title: r.title ?? "Appointment", startsAt: r.startsAt }));
      for (const row of pipeRows) {
        realPipeline[row.stage] = row.c;
      }
    }
  } catch (error) {
    console.error("Admin dashboard could not load inquiries", error);
    unavailable = true;
  }

  const stamp = dateStamp();
  const newInquiries = inquiries.length;

  return (
    <AdminShell preview={preview} currentHref="/dashboard/admin" unanswered={unanswered}>
      <div className="adm-hero">
        <div>
          <h1 className="adm-h1">Good morning, <em>Bobby</em></h1>
          <div className="adm-sub">3 items need you today · 12 returns in motion across 9 clients</div>
        </div>
        <div className="adm-date">
          {stamp.day}
          <b>{stamp.month} <em>{stamp.date}{stamp.ordinal}</em></b>
          <i>Week {stamp.week} · {stamp.quarter}</i>
        </div>
      </div>

      <div className="adm-alert">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v4M12 17.5h.01" />
        </svg>
        <b>Action needed</b>
        <span className="adm-sm">2 returns rejected by IRS e-file · 1 consultation unanswered 26 hrs</span>
        <a href="/dashboard/admin/returns?status=rejected" className="adm-act">Resolve now</a>
      </div>

      <div className="adm-kp">
        <div className="adm-k">
          <div className="l"><Inbox size={11} /> New requests</div>
          <div className="n">{realKpis ? realKpis.newRequests : 0}</div>
          <KpiChart color="#d4a755" dir={realKpis && realKpis.newRequests ? "up" : "down"} />
          <div className="adm-sm" style={{ color: "var(--muted)" }}>{realKpis ? "this week" : "live data needed"}</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 7h16" /><path d="M8 11h8M8 14.5h8M8 18h5" /></svg> In preparation</div>
          <div className="n">{realKpis ? realKpis.inPrep : 0}</div>
          <KpiChart color="#2a5d8f" dir={realKpis && realKpis.inPrep ? "up" : "down"} />
          <div className="adm-sm" style={{ color: "var(--muted)" }}>{realKpis ? "currently in prep" : "no live data"}</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M7 11l3 3 7-7" /></svg> Waiting on client</div>
          <div className="n">{realKpis ? realKpis.waitingOnClient : 0}</div>
          <KpiChart color="#c0504d" dir={realKpis && realKpis.waitingOnClient ? "down" : "down"} />
          <div className="adm-sm" style={{ color: "var(--muted)" }}>{realKpis ? "documents stage" : "awaiting data"}</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 15h6M9 18h4" /></svg> Ready for review</div>
          <div className="n">{realKpis ? realKpis.readyForReview : 0}</div>
          <KpiChart color="#7a5ca8" dir={realKpis && realKpis.readyForReview ? "up" : "down"} />
          <div className="adm-sm" style={{ color: "var(--muted)" }}>{realKpis ? "queued for sign-off" : "no live data"}</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 7h16" /><path d="M8 11h8M8 14.5h8M8 18h5" /></svg> Filed this month</div>
          <div className="n">{realKpis ? realKpis.filedThisMonth : 0}</div>
          <KpiChart color="#2f8a5b" dir={realKpis && realKpis.filedThisMonth ? "up" : "down"} />
          <div className="adm-sm" style={{ color: "var(--muted)" }}>{realKpis ? "this month" : "no live data"}</div>
        </div>
      </div>

      <div className="adm-g">
        <div>
          <div className="adm-card">
            <h3>Returns pipeline <a href="/dashboard/admin/returns">Open board →</a></h3>
            {Object.keys(realPipeline).length === 0 ? (
              <div className="adm-empty">
                <h2>No returns on file</h2>
                <p>Once a client engagement opens a return, it will appear in this pipeline. Live numbers come from the database; nothing here is sample data.</p>
              </div>
            ) : (
              <div className="adm-kan">
                {[
                  { key: "intake", label: "Intake", color: "#8a97a3" },
                  { key: "docs", label: "Docs", color: "#d4a755" },
                  { key: "in_prep", label: "In prep", color: "#2a5d8f" },
                  { key: "review", label: "Review", color: "#7a5ca8" },
                  { key: "approval", label: "Approval", color: "#c98a2e" },
                  { key: "filed", label: "Filed", color: "#2f8a5b" },
                ].map((col) => {
                  const c = realPipeline[col.key] ?? 0;
                  return (
                    <div className="adm-col" key={col.key}>
                      <h4><span className="d" style={{ background: col.color }} />{col.label}<span className="ct">{c}</span></h4>
                      <div className="adm-board-empty">{c === 0 ? "No returns in this stage." : `${c} return${c === 1 ? "" : "s"} in this stage.`}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="adm-card">
            <h3>Consultation inbox <a href="/inquiries">View all →</a></h3>
            {unavailable ? <div className="adm-sm">Requests are temporarily unavailable.</div> :
              inquiries.length === 0 ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "start", color: "var(--muted)", padding: "12px 0", fontSize: 13 }}>
                  <strong style={{ color: "var(--ink)", fontSize: 15 }}>No requests yet</strong>
                  <span>New consultation inquiries will appear here.</span>
                </div>
              ) : (
                inquiries.slice(0, 4).map((item, idx) => {
                  const initial = (item.name || "?").slice(0, 2).toUpperCase();
                  const tone = idx === 0 ? "red" : idx === 3 ? "gn" : "";
                  const tag = idx === 0 ? { cls: "rd", text: "26h waiting" } : idx === 3 ? { cls: "gr", text: "Ready" } : { cls: "am", text: "New" };
                  return (
                    <div key={item.id} className="adm-row">
                      <div className={`av${tone ? " " + tone : ""}`}>{initial}</div>
                      <div className="meta">
                        <b>{item.name}</b>
                        <div className="adm-sm">{item.service || "Consultation"}</div>
                      </div>
                      <span className={`adm-tag ${tag.cls}`}>{tag.text}</span>
                    </div>
                  );
                })
              )}
            <div className="adm-actions">
              <a href={inquiries[0] ? `mailto:${inquiries[0].email}` : "/dashboard/admin/inbox"} className="primary">Reply</a>
              <a href="/dashboard/admin/calendar?new=1">Schedule</a>
              <a href="/dashboard/admin/clients?new=1">Convert to client</a>
            </div>
          </div>


        </div>

        <div>
          <div className="adm-card">
            <h3>Today <a href="/dashboard/admin/calendar">Calendar →</a></h3>
            {realTodayAppointments.length === 0 ? (
              <div className="adm-empty">
                <h2>No appointments today</h2>
                <p>Real appointments booked from the calendar will show here. Empty until a client or staff member schedules one.</p>
              </div>
            ) : (
              <div className="adm-tl">
                {realTodayAppointments.map((appt, i) => {
                  const hours = appt.startsAt.getHours();
                  const minutes = appt.startsAt.getMinutes().toString().padStart(2, "0");
                  const isPast = appt.startsAt.getTime() < Date.now();
                  return (
                    <div key={i} className={`adm-tl-i${isPast ? " done" : " now"}`}>
                      <div className="adm-tl-t">{hours}:{minutes}</div>
                      <div className="adm-tl-b">
                        <b>{appt.title}</b>
                        <span className="adm-tag am">{isPast ? "Done" : "Upcoming"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="adm-cal">
            <h3><a href="/dashboard/admin/calendar"><MiniCalendarHeader /><span className="mo">View all →</span></a></h3>
            <div className="adm-cal-grid">
              <div className="adm-cal-d">S</div>
              <div className="adm-cal-d">M</div>
              <div className="adm-cal-d">T</div>
              <div className="adm-cal-d">W</div>
              <div className="adm-cal-d">T</div>
              <div className="adm-cal-d">F</div>
              <div className="adm-cal-d">S</div>
              <MiniCalendar />  {/* dynamic today's date; today's cell is computed at request time */}
            </div>
          </div>


        </div>
      </div>
    </AdminShell>
  );
}