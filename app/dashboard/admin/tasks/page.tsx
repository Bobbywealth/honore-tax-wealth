import { CheckSquare, Filter } from "lucide-react";
import { asc, eq, inArray, isNull, or, and } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { adminNav } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["open", "in_progress", "blocked"] as const;

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

type Row = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

function dueLabel(dueAt: Date | null): { text: string; overdue: boolean; today: boolean } {
  if (!dueAt) return { text: "No due date", overdue: false, today: false };
  const target = new Date(dueAt);
  const now = new Date();
  const overdue = target.getTime() < now.getTime();
  const today = target.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(target);
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(target);
  return { text: today ? `Today ${time}` : date, overdue, today };
}

export default async function TasksPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const nav = adminNav(await loadAdminNavCounts());

  let open: Row[] = [];
  let done: Row[] = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    const selection = {
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
    };

    [open, done] = await Promise.all([
      db
        .select(selection)
        .from(tasks)
        .where(inArray(tasks.status, [...OPEN_STATUSES]))
        // Overdue and due-today first, then by priority, then by date.
        .orderBy(asc(tasks.dueAt))
        .limit(200),
      db
        .select(selection)
        .from(tasks)
        .where(and(eq(tasks.status, "done"), or(isNull(tasks.completedAt), eq(tasks.completedAt, tasks.completedAt))))
        .orderBy(asc(tasks.dueAt))
        .limit(50),
    ]);
  } catch {
    unavailable = true;
  }

  open.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return pa - pb;
  });

  const overdueCount = open.filter((t) => {
    const d = dueLabel(t.dueAt);
    return d.overdue;
  }).length;

const navCounts = await loadAdminNavCounts();
  const conversationsUnread = navCounts.conversationsUnread;
  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/tasks" audience="Admin" title="Tasks" description="Open work for staff and clients, with deadlines.">
      <div className="adm-page-h">
        <div>
          <h1>Tasks</h1>
          <div className="sub">
            {unavailable
              ? "Unavailable"
              : `${open.length} open · ${overdueCount} overdue`}
          </div>
        </div>
        <span className="adm-badge">
          <Filter size={13} aria-hidden="true" /> All assignees
        </span>
      </div>

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load tasks. Nothing has been lost — try again shortly.</p>
        </div>
      ) : (
        <>
          <section className="adm-section">
            <h2>Open</h2>
            {open.length === 0 ? (
              <div className="adm-empty">
                <CheckSquare size={22} aria-hidden="true" />
                <h2>Nothing open</h2>
                <p>New tasks assigned to you or the team appear here.</p>
              </div>
            ) : (
              <ul className="adm-task-list">
                {open.map((t) => {
                  const due = dueLabel(t.dueAt);
                  return (
                    <li key={t.id} className={`adm-task${due.overdue ? " is-overdue" : ""}`}>
                      <div className="adm-task-main">
                        <strong>{t.title}</strong>
                        {t.description ? <p>{t.description}</p> : null}
                      </div>
                      <div className="adm-task-meta">
                        <span className="adm-badge">{t.priority}</span>
                        <span className="adm-badge">{t.status.replace("_", " ")}</span>
                        <time dateTime={t.dueAt ? new Date(t.dueAt).toISOString() : undefined} className={due.overdue ? "is-overdue" : due.today ? "is-today" : undefined}>
                          {due.text}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {done.length > 0 ? (
            <section className="adm-section">
              <h2>Recently completed</h2>
              <ul className="adm-task-list is-done">
                {done.slice(0, 25).map((t) => (
                  <li key={t.id} className="adm-task">
                    <div className="adm-task-main">
                      <strong>{t.title}</strong>
                    </div>
                    <div className="adm-task-meta">
                      <span className="adm-badge">done</span>
                      <time dateTime={t.completedAt ? new Date(t.completedAt).toISOString() : undefined}>
                        {t.completedAt ? new Date(t.completedAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/New_York" }) : ""}
                      </time>
                      <form action={`/api/admin/tasks/${t.id}/toggle`} method="post" className="adm-task-action">
                        <button type="submit" className="adm-btn adm-btn-mini" title="Reopen this task">Reopen</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}