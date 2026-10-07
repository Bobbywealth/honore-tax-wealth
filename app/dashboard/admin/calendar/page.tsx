import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon } from "lucide-react";
import { and, eq, gte, lt } from "drizzle-orm";
import AdminShell from "../AdminShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { appointments, clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ApptRow = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  clientId: string | null;
  status: string;
};

function buildGrid(year: number, month0: number) {
  const first = new Date(Date.UTC(year, month0, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(year, month0, 0)).getUTCDate();
  const cells: Array<{ y: number; m: number; d: number; muted: boolean }> = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevDays - i;
    const pm = month0 === 0 ? 11 : month0 - 1;
    const py = month0 === 0 ? year - 1 : year;
    cells.push({ y: py, m: pm, d, muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month0, d, muted: false });
  const trailing = 42 - cells.length;
  for (let d = 1; d <= trailing; d++) {
    const nm = month0 === 11 ? 0 : month0 + 1;
    const ny = month0 === 11 ? year + 1 : year;
    cells.push({ y: ny, m: nm, d, muted: true });
  }
  return cells;
}

function formatDayKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function prevNext(year: number, month0: number) {
  const pm = month0 === 0 ? 11 : month0 - 1;
  const py = month0 === 0 ? year - 1 : year;
  const nm = month0 === 11 ? 0 : month0 + 1;
  const ny = month0 === 11 ? year + 1 : year;
  return { prev: { y: py, m: pm }, next: { y: ny, m: nm } };
}

function rangeForMonth(year: number, month0: number) {
  return {
    start: new Date(Date.UTC(year, month0, 1)),
    end: new Date(Date.UTC(year, month0 + 1, 1)),
  };
}

export default async function CalendarPage({ searchParams }: { searchParams?: Promise<{ preview?: string; y?: string; m?: string; new?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;

  const sp = (await searchParams) ?? {};
  const today = new Date();
  const year = sp.y ? parseInt(sp.y, 10) : today.getUTCFullYear();
  const month0 = sp.m ? parseInt(sp.m, 10) - 1 : today.getUTCMonth();
  const showForm = sp.new === "1";
  const { prev, next } = prevNext(year, month0);
  const grid = buildGrid(year, month0);
  const { start, end } = rangeForMonth(year, month0);

  let appts: ApptRow[] = [];
  let clientList: Array<{ id: string; name: string }> = [];
  let unavailable = false;
  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const rows = await getDb()
        .select({
          id: appointments.id,
          title: appointments.title,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          clientId: appointments.clientId,
          status: appointments.status,
        })
        .from(appointments)
        .where(and(gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
        .orderBy(appointments.startsAt);
      appts = rows;
    }

    if (showForm) {
      const cliRows = await getDb()
        .select({ id: clients.id, name: clients.displayName })
        .from(clients)
        .where(eq(clients.status, "active"))
        .orderBy(clients.displayName)
        .limit(200);
      clientList = cliRows;
    }
  } catch {
    unavailable = true;
  }

  const byDay = new Map<string, ApptRow[]>();
  for (const a of appts) {
    const d = new Date(a.startsAt);
    const k = formatDayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const arr = byDay.get(k) ?? [];
    if (arr.length < 3) arr.push(a);
    byDay.set(k, arr);
  }

  const todayKey = formatDayKey(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const upcoming = appts.slice(0, 8).map((a) => {
    const d = new Date(a.startsAt);
    const isToday = formatDayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) === todayKey;
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    const dateLabel = isToday ? time : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return { time: dateLabel, title: a.title, sub: a.status, tag: isToday ? "Today" : "Scheduled" };
  });

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/calendar">
      <div className="adm-page-h">
        <div>
          <h1>Calendar</h1>
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `${appts.length} event${appts.length === 1 ? "" : "s"} in ${MONTHS[month0]} ${year}`}
          </div>
        </div>
        <a className="adm-btn" href="?new=1" title="Create a new appointment">
          <Plus size={13} /> New event
        </a>
      </div>

      {showForm ? (
        <form className="adm-quick-form" action="/api/admin/appointments" method="post">
          <div className="adm-quick-form-row">
            <label>Title<input name="title" required maxLength={240} placeholder="e.g. Discovery call with Marcus" /></label>
            <label>Date<input name="date" type="date" required defaultValue={`${year}-${String(month0 + 1).padStart(2, "0")}-01`} /></label>
          </div>
          <div className="adm-quick-form-row">
            <label>Start<input name="startsAt" type="time" required defaultValue="09:00" /></label>
            <label>End<input name="endsAt" type="time" defaultValue="10:00" /></label>
          </div>
          {showForm && clientList.length > 0 ? (
            <label>Client<select name="clientId" required defaultValue="">
              <option value="" disabled>Select a client…</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select></label>
          ) : null}
          {showForm && clientList.length === 0 ? (
            <p className="adm-sm" style={{ margin: 0 }}>
              No active clients yet — create a client from the Clients page before scheduling appointments.
            </p>
          ) : null}
          <label className="adm-quick-form-notes">Notes<textarea name="notes" maxLength={1000} rows={2} placeholder="Optional context" /></label>
          <div className="adm-quick-form-actions">
            <button type="submit" className="adm-btn">Create event</button>
            <a className="adm-btn adm-btn-ghost" href="/dashboard/admin/calendar">Cancel</a>
          </div>
        </form>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div className="adm-cal-full">
          <h3>
            {MONTHS[month0]} {year}
            <div className="adm-cal-nav">
              <a href={`?y=${prev.y}&m=${prev.m + 1}`} aria-label="Previous month"><ChevronLeft size={14} /></a>
              <a href={`?y=${today.getUTCFullYear()}&m=${today.getUTCMonth() + 1}`} className="adm-cal-today">TODAY</a>
              <a href={`?y=${next.y}&m=${next.m + 1}`} aria-label="Next month"><ChevronRight size={14} /></a>
            </div>
          </h3>
          <div className="adm-cal-grid-full">
            <div className="adm-cal-d">SUN</div>
            <div className="adm-cal-d">MON</div>
            <div className="adm-cal-d">TUE</div>
            <div className="adm-cal-d">WED</div>
            <div className="adm-cal-d">THU</div>
            <div className="adm-cal-d">FRI</div>
            <div className="adm-cal-d">SAT</div>
            {grid.map((c, i) => {
              const k = formatDayKey(c.y, c.m, c.d);
              const dayAppts = byDay.get(k) ?? [];
              const isToday = k === todayKey && !c.muted;
              return (
                <div
                  key={i}
                  className={`adm-cal-cell${c.muted ? " muted" : ""}${isToday ? " today" : ""}`}
                  title={`${c.d} ${MONTHS[c.m]}${dayAppts.length ? " — " + dayAppts.length + " event(s)" : ""}`}
                >
                  <div className="n">{c.d}</div>
                  {dayAppts.map((a) => (
                    <div key={a.id} className="ev">{a.title}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="adm-card">
          <h3>Upcoming</h3>
          {upcoming.length === 0 ? (
            <p className="adm-sm" style={{ marginTop: 8 }}>
              {unavailable
                ? "We could not load events. Nothing has been lost — try again shortly."
                : "No events scheduled for this month yet."}
            </p>
          ) : (
            upcoming.map((u, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? 0 : "1px solid #efece3", alignItems: "flex-start" }}>
                <div style={{ minWidth: 64, font: "500 11px Fraunces, Georgia, serif", color: "#9a7a2e", textAlign: "right" }}>{u.time}</div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 12.5, fontWeight: 600, color: "#0e1a26", display: "block" }}>{u.title}</b>
                  <div className="adm-sm" style={{ marginTop: 2 }}>{u.sub}</div>
                  <span className={`adm-tag ${u.tag === "Today" ? "am" : "bl"}`} style={{ marginTop: 6 }}>{u.tag}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
