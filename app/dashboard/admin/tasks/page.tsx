import { CheckSquare, Filter, LayoutList, KanbanSquare, Plus } from "lucide-react";
import Link from "next/link";
import { asc, eq, inArray, isNull, or, and } from "drizzle-orm";
import DashboardShell from "../../DashboardShell";
import { loadAdminNavCounts } from "../lib/nav-counts";
import { navForRole } from "../_lib/nav";
import { checkAdminAccess } from "../auth";
import { getDb } from "@/db";
import { tasks, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";

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

export default async function TasksPage({ searchParams }: { searchParams?: Promise<{ view?: string; assignee?: string; new?: string; created?: string; error?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;

  const counts = await loadAdminNavCounts();
  const me = await currentUser();
  const nav = navForRole(me?.role, counts);
  const sp = (await searchParams) ?? {};
  const kanban = sp.view === "kanban";
  const showNewForm = sp.new === "1";
  const justCreated = sp.created === "1";
  const formError = sp.error ?? "";
  // Non-admin agents only see their own tasks. The URL can override to
  // "all" with ?assignee= (admin-only affordance), but the default — and
  // anything not explicitly named — is "just me".
  const rawAssigneeFilter = sp.assignee ?? "";
  const assigneeFilter =
    me?.id && me.role !== "admin"
      ? rawAssigneeFilter === "" || rawAssigneeFilter === "all"
        ? me.id
        : rawAssigneeFilter
      : rawAssigneeFilter;

  let open: Row[] = [];
  let done: Row[] = [];
  let unavailable = false;
  let assigneeOptions: Array<{ id: string; name: string }> = [];

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

    const whereExpr = assigneeFilter
      ? and(inArray(tasks.status, [...OPEN_STATUSES]), eq(tasks.assignedToId, assigneeFilter))
      : inArray(tasks.status, [...OPEN_STATUSES]);

    const [openRows, doneRows, assigneeRows] = await Promise.all([
      db.select(selection).from(tasks).where(whereExpr).orderBy(asc(tasks.dueAt)).limit(200),
      db
        .select(selection)
        .from(tasks)
        .where(and(eq(tasks.status, "done"), or(isNull(tasks.completedAt), eq(tasks.completedAt, tasks.completedAt))))
        .orderBy(asc(tasks.dueAt))
        .limit(50),
      db.select({ id: users.id, name: users.displayName }).from(users).limit(200),
    ]);
    open = openRows;
    done = doneRows;
    assigneeOptions = assigneeRows
      .filter((u): u is { id: string; name: string } => !!u.id)
      .map((u) => ({ id: u.id, name: u.name ?? u.id.slice(0, 6) }));
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <form method="get" className="adm-tasks-assignee" aria-label="Filter tasks by assignee">
            <Filter size={13} aria-hidden="true" />
            <select name="assignee" defaultValue={assigneeFilter} aria-label="Filter by assignee">
              <option value="">All assignees</option>
              {assigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {kanban ? <input type="hidden" name="view" value="kanban" /> : null}
            <button type="submit" className="adm-btn adm-btn-mini">Apply</button>
          </form>
          <div className="adm-view-toggle" role="group" aria-label="View">
            <Link
              href="/dashboard/admin/tasks?view=list"
              className={`adm-view-opt${kanban ? "" : " is-active"}`}
              aria-pressed={!kanban}
              title="List view"
            >
              <LayoutList size={13} aria-hidden="true" /> List
            </Link>
            <Link
              href="/dashboard/admin/tasks?view=kanban"
              className={`adm-view-opt${kanban ? " is-active" : ""}`}
              aria-pressed={kanban}
              title="Kanban view"
            >
              <KanbanSquare size={13} aria-hidden="true" /> Kanban
            </Link>
          </div>
          <a className="adm-btn" href="/dashboard/admin/tasks?new=1">
            <Plus size={13} aria-hidden="true" /> New task
          </a>
        </div>
      </div>

      {justCreated ? (
        <div className="adm-alert" role="status" style={{ borderLeftColor: "var(--green)" }}>
          <b style={{ color: "var(--green)" }}>Task created</b>
          <span className="adm-sm">It now appears in the list below.</span>
        </div>
      ) : null}

      {showNewForm ? (
        <form className="adm-card adm-task-new" method="post" action="/api/admin/tasks">
          <h3>New task</h3>
          {formError ? (
            <p className="adm-sm" role="alert" style={{ color: "var(--red)" }}>
              {formError === "invalid"
                ? "Please give the task a title (max 240 characters)."
                : "Could not save the task. Please try again."}
            </p>
          ) : null}
          <label>
            <span className="adm-sm">Title</span>
            <input type="text" name="title" required maxLength={240} placeholder="e.g. Review Okafor 1040" />
          </label>
          <label>
            <span className="adm-sm">Details <em>(optional)</em></span>
            <textarea name="description" rows={3} maxLength={2000} placeholder="What needs to happen?" />
          </label>
          <div className="adm-task-new-row">
            <label>
              <span className="adm-sm">Priority</span>
              <select name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span className="adm-sm">Due <em>(optional)</em></span>
              <input type="date" name="dueAt" />
            </label>
            <label>
              <span className="adm-sm">Assign to <em>(optional)</em></span>
              <select name="assignedToId" defaultValue="">
                <option value="">Unassigned</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="adm-task-new-actions">
            <button type="submit" className="adm-btn">Create task</button>
            <a className="adm-btn" href="/dashboard/admin/tasks" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none" }}>
              Cancel
            </a>
          </div>
        </form>
      ) : null}

      {unavailable ? (
        <div className="adm-empty">
          <p>We could not load tasks. Nothing has been lost — try again shortly.</p>
        </div>
      ) : kanban ? (
        (() => {
          const buckets: Record<string, Row[]> = {
            blocked: [],
            open: [],
            in_progress: [],
            done: done.slice(0, 25),
          };
          for (const t of open) {
            const k = t.status in buckets ? t.status : "open";
            buckets[k].push(t);
          }
          return (
            <div className="adm-tasks-cols">
              {[
                { key: "blocked", label: "Blocked" },
                { key: "open", label: "Open" },
                { key: "in_progress", label: "In progress" },
                { key: "done", label: "Done" },
              ].map((col) => (
                <div key={col.key} className="adm-tasks-col">
                  <h3>
                    {col.label}
                    <span className="ct">{buckets[col.key].length}</span>
                  </h3>
                  {buckets[col.key].length === 0 ? (
                    <div className="adm-empty" style={{ padding: 14 }}>
                      <p style={{ fontSize: 11, color: "#7a858e" }}>Nothing in this lane.</p>
                    </div>
                  ) : (
                    buckets[col.key].map((t) => {
                      const due = dueLabel(t.dueAt);
                      return (
                        <div key={t.id} className="adm-task" role="button" tabIndex={0}>
                          <span className="chk" aria-hidden="true" />
                          <div className="adm-task-body">
                            <b>{t.title}</b>
                            {t.description ? <div className="sm">{t.description}</div> : null}
                            <div className={`due ${due.overdue ? "overdue" : due.today ? "today" : ""}`}>{due.text} · {t.priority}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          );
        })()
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