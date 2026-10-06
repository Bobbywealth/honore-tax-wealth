import { checkAdminAccess } from "./auth";
import { Inbox } from "lucide-react";
import AdminShell from "./AdminShell";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { desc } from "drizzle-orm";

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

function OctoberCalendar() {
  const cells: Array<{ d: number; muted?: boolean; today?: boolean; deadline?: boolean; has?: boolean }> = [];
  const sept: Array<{ d: number; muted: boolean; has?: boolean }> = [
    { d: 28, muted: true }, { d: 29, muted: true }, { d: 30, muted: true },
  ];
  const oct: Array<{ d: number; today?: boolean; deadline?: boolean; has?: boolean }> = [
    { d: 1, has: true }, { d: 2, has: true }, { d: 3, has: true }, { d: 4, today: true },
    { d: 5, has: true }, { d: 6, has: true }, { d: 7 }, { d: 8 }, { d: 9 },
    { d: 10, has: true }, { d: 11 }, { d: 12 }, { d: 13, has: true }, { d: 14, has: true },
    { d: 15, deadline: true }, { d: 16 }, { d: 17 }, { d: 18 }, { d: 19 }, { d: 20 },
    { d: 21 }, { d: 22 }, { d: 23 }, { d: 24 }, { d: 25 }, { d: 26 }, { d: 27 },
    { d: 28 }, { d: 29 }, { d: 30 }, { d: 31 },
  ];
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
  const dismissed = sp.dismiss === "ai";

  let inquiries: Inquiry[] = [];
  let unavailable = false;
  try {
    if (!preview && process.env.DATABASE_URL) {
      await ensureMigrated();
      const rows = await getDb()
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
    }
  } catch (error) {
    console.error("Admin dashboard could not load inquiries", error);
    unavailable = true;
  }

  const stamp = dateStamp();
  const newInquiries = inquiries.length;

  return (
    <AdminShell preview={preview} currentHref="/dashboard/admin">
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
          <div className="n">{newInquiries || 3}<em>/wk</em></div>
          <KpiChart color="#d4a755" dir="up" />
          <div className="adm-up">▲ 2 vs last week</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 7h16" /><path d="M8 11h8M8 14.5h8M8 18h5" /></svg> In preparation</div>
          <div className="n">18</div>
          <KpiChart color="#2a5d8f" dir="up" />
          <div className="adm-up">▲ 4 this week</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M7 11l3 3 7-7" /></svg> Waiting on client</div>
          <div className="n">9</div>
          <KpiChart color="#c0504d" dir="down" />
          <div className="adm-dn">▲ 3 overdue</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 15h6M9 18h4" /></svg> Ready for review</div>
          <div className="n">6</div>
          <KpiChart color="#7a5ca8" dir="up" />
          <div className="adm-mutetext">avg 1.2 day turnaround</div>
        </div>
        <div className="adm-k">
          <div className="l"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 7h16" /><path d="M8 11h8M8 14.5h8M8 18h5" /></svg> Filed this month</div>
          <div className="n">41</div>
          <KpiChart color="#2f8a5b" dir="up" />
          <div className="adm-up">▲ 12% MoM</div>
        </div>
      </div>

      <div className="adm-g">
        <div>
          <div className="adm-card">
            <h3>Returns pipeline <a href="/dashboard/admin/returns">Open board →</a></h3>
            <div className="adm-kan">
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#8a97a3" }} />Intake<span className="ct">7</span></h4>
                <div className="adm-ticket"><b>Marcus Hale</b><div className="adm-sm">1040 · Individual</div><div className="amt">$485</div></div>
                <div className="adm-ticket"><b>J. Okafor</b><div className="adm-sm">1065 · S-Corp</div><div className="amt">$1,240</div></div>
              </div>
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#d4a755" }} />Docs<span className="ct">9</span></h4>
                <div className="adm-ticket"><b>S. Whitlock</b><div className="adm-sm">1120-S · K-1</div><div className="amt">$920</div></div>
                <div className="adm-ticket"><b>R. Castillo</b><div className="adm-sm">1040 · Sch C</div><div className="amt">$680</div></div>
              </div>
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#2a5d8f" }} />In prep<span className="ct">18</span></h4>
                <div className="adm-ticket"><b>Lena Rivera</b><div className="adm-sm">1040 · Sch C</div><div className="amt">$1,450</div></div>
                <div className="adm-ticket"><b>A. Patel</b><div className="adm-sm">1120-S · Partner</div><div className="amt">$2,180</div></div>
              </div>
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#7a5ca8" }} />Review<span className="ct">6</span></h4>
                <div className="adm-ticket"><b>D. Park</b><div className="adm-sm">1040X · Amended</div><div className="amt">$1,890</div></div>
              </div>
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#c98a2e" }} />Approval<span className="ct">4</span></h4>
                <div className="adm-ticket"><b>Sharon Kim</b><div className="adm-sm">1040 · JOINT</div><div className="amt">$720</div></div>
              </div>
              <div className="adm-col">
                <h4><span className="d" style={{ background: "#2f8a5b" }} />Filed<span className="ct">41</span></h4>
                <div className="adm-ticket"><b>P. Hassan</b><div className="adm-sm">1065 · Partnership</div><div className="amt" style={{ color: "#2f7a52" }}>$3,420</div></div>
              </div>
            </div>
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

          {dismissed ? null : (
          <div className="adm-ai">
            <div className="lbl">✦ Practice AI</div>
            <h4>4 unfiled 2023 returns past the 30-day prep window.</h4>
            <p>Assign Marcus Hale to J. Okafor, draft K-1 request letters today, and surface extensions for the 2 at-risk for Oct 15.</p>
            <div className="ctas">
              <a href="/dashboard/admin/tasks">Plan my day →</a>
              <a href="/dashboard/admin?dismiss=ai">Dismiss</a>
            </div>
          </div>
          )}

        </div>

        <div>
          <div className="adm-card">
            <h3>Today <a href="/dashboard/admin/calendar">Calendar →</a></h3>
            <div className="adm-tl">
              <div className="adm-tl-i done">
                <div className="adm-tl-t">9:00</div>
                <div className="adm-tl-b">
                  <b>Standup with staff</b>
                  <div className="adm-sm">Marcus, Sharon, David</div>
                </div>
              </div>
              <div className="adm-tl-i now">
                <div className="adm-tl-t">10:30</div>
                <div className="adm-tl-b">
                  <b>Call Marcus Taylor</b>
                  <div className="adm-sm">Discovery · 30 min</div>
                  <span className="adm-tag am">Now</span>
                </div>
              </div>
              <div className="adm-tl-i">
                <div className="adm-tl-t">13:00</div>
                <div className="adm-tl-b">
                  <b>Review Rivera 1040</b>
                  <div className="adm-sm">Schedule C · needs sign-off</div>
                  <span className="adm-tag bl">Review</span>
                </div>
              </div>
              <div className="adm-tl-i">
                <div className="adm-tl-t">15:30</div>
                <div className="adm-tl-b">
                  <b>Approve Sharon Kim engagement</b>
                  <div className="adm-sm">Awaiting countersign</div>
                </div>
              </div>
              <div className="adm-tl-i">
                <div className="adm-tl-t">17:00</div>
                <div className="adm-tl-b">
                  <b>End-of-day triage</b>
                  <div className="adm-sm">Clear inbox, plan tomorrow</div>
                </div>
              </div>
            </div>
          </div>

          <div className="adm-cal">
            <h3><a href="/dashboard/admin/calendar"><span>October 2026</span><span className="mo">View all →</span></a></h3>
            <div className="adm-cal-grid">
              <div className="adm-cal-d">S</div>
              <div className="adm-cal-d">M</div>
              <div className="adm-cal-d">T</div>
              <div className="adm-cal-d">W</div>
              <div className="adm-cal-d">T</div>
              <div className="adm-cal-d">F</div>
              <div className="adm-cal-d">S</div>
              <OctoberCalendar />
            </div>
          </div>

          <div className="adm-card">
            <h3>Practice pulse</h3>
            <div className="adm-pulse-grid">
              <div>
                <div className="l">Utilization</div>
                <div className="n">78<em>%</em></div>
                <div className="adm-up">▲ 6% MoM</div>
              </div>
              <div>
                <div className="l">Revenue MTD</div>
                <div className="n">$84.2<em>k</em></div>
                <div className="adm-up">▲ 18% MoM</div>
              </div>
            </div>
            <svg className="adm-pulse-chart" viewBox="0 0 320 50" preserveAspectRatio="none">
              <defs>
                <linearGradient id="adm-pulse-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#d4a755" stopOpacity=".4" />
                  <stop offset="1" stopColor="#d4a755" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,38 L25,34 L50,30 L75,32 L100,24 L125,26 L150,18 L175,20 L200,14 L225,16 L250,10 L275,12 L300,6 L320,4 L320,50 L0,50 Z" fill="url(#adm-pulse-grad)" />
              <path d="M0,38 L25,34 L50,30 L75,32 L100,24 L125,26 L150,18 L175,20 L200,14 L225,16 L250,10 L275,12 L300,6 L320,4" fill="none" stroke="#d4a755" strokeWidth="1.8" />
            </svg>
            <div className="adm-pulse-cap">12-WEEK FILING TREND</div>
          </div>

          <div className="adm-card">
            <h3>Recent uploads</h3>
            <div className="adm-uploads">
              <div className="adm-up-row">
                <div className="adm-up-icon pdf">PDF</div>
                <div className="f1"><b>Rivera_W2_2025.pdf</b><div className="f">2 min ago · 1.2 MB</div></div>
              </div>
              <div className="adm-up-row">
                <div className="adm-up-icon">W9</div>
                <div className="f1"><b>Okafor_1099-MISC.pdf</b><div className="f">14 min ago · 845 KB</div></div>
              </div>
              <div className="adm-up-row">
                <div className="adm-up-icon img">JPG</div>
                <div className="f1"><b>Patel_receipts.jpg</b><div className="f">1 hr ago · 3.4 MB</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
