"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, FileText, Receipt, ClipboardList, UserPlus } from "lucide-react";

type NavItem = { id?: string; label: string; href: string; icon?: React.ReactNode; badge?: { value: number; tone?: "default" | "red" | "amber" } };
type Result = { id: string; label: string; sub?: string; href: string };

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin" },
  { label: "Inbox", href: "/dashboard/admin/inbox" },
  { label: "Messages", href: "/dashboard/admin/messages" },
  { label: "Clients", href: "/dashboard/admin/clients" },
  { label: "Returns", href: "/dashboard/admin/returns" },
  { label: "Documents", href: "/dashboard/admin/documents" },
  { label: "Tasks", href: "/dashboard/admin/tasks" },
  { label: "Calendar", href: "/dashboard/admin/calendar" },
  { label: "Leads", href: "/dashboard/admin/leads" },
  { label: "Reports", href: "/dashboard/admin/reports" },
  { label: "Team", href: "/dashboard/admin/team" },
  { label: "Settings", href: "/dashboard/admin/settings" },
];

const ACTIONS: NavItem[] = [
  { label: "New lead", href: "/dashboard/admin/leads?new=1" },
  { label: "New return", href: "/dashboard/admin/returns?new=1" },
  { label: "New appointment", href: "/dashboard/admin/calendar?new=1" },
  { label: "New task", href: "/dashboard/admin/tasks?new=1" },
  { label: "Open messages inbox", href: "/dashboard/admin/messages" },
];

const KIND_META: Record<string, { label: string; icon: React.ReactNode; }> = {
  nav: { label: "Pages", icon: <ArrowRight size={14} aria-hidden="true" /> },
  actions: { label: "Actions", icon: <ArrowRight size={14} aria-hidden="true" /> },
  clients: { label: "Clients", icon: <UserPlus size={14} aria-hidden="true" /> },
  engagements: { label: "Engagements", icon: <ClipboardList size={14} aria-hidden="true" /> },
  invoices: { label: "Invoices", icon: <Receipt size={14} aria-hidden="true" /> },
  leads: { label: "Leads", icon: <UserPlus size={14} aria-hidden="true" /> },
};

/**
 * Global Cmd-K / Ctrl-K command palette. Mounts once at the top of the
 * admin shell. Always-available shortcuts:
 *   Cmd/Ctrl-K  → open
 *   Esc          → close
 *   ↑/↓          → navigate
 *   Enter        → activate
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [serverResults, setServerResults] = useState<Record<string, Result[]>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Toggle on the global hotkey.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input when opened.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Debounced server search when the query is long enough.
  useEffect(() => {
    if (q.trim().length < 2) {
      setServerResults({});
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/quick-search?q=${encodeURIComponent(q.trim())}`, { headers: { accept: "application/json" } });
        if (!res.ok) {
          setServerResults({});
          return;
        }
        const json = (await res.json()) as { results: Record<string, Result[]> };
        setServerResults(json.results);
      } catch {
        setServerResults({});
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(handle);
  }, [q]);

  const groups = useMemo(() => {
    const out: Array<{ kind: string; items: NavItem[] | Result[] }> = [];
    const lower = q.trim().toLowerCase();
    const navMatches = NAV.filter((n) => !lower || n.label.toLowerCase().includes(lower));
    const actionMatches = !lower ? ACTIONS.slice(0, 4) : ACTIONS.filter((a) => a.label.toLowerCase().includes(lower));
    if (navMatches.length) out.push({ kind: "nav", items: navMatches });
    if (actionMatches.length) out.push({ kind: "actions", items: actionMatches });
    for (const k of ["clients", "engagements", "invoices", "leads"] as const) {
      const items = serverResults[k] ?? [];
      if (items.length) out.push({ kind: k, items });
    }
    return out;
  }, [q, serverResults]);

  const flat = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, _kind: g.kind }))), [groups]);

  function go(item: NavItem | Result) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flat[active];
      if (target) go(target);
    }
  }

  if (!open) return null;

  return (
    <div className="cmdk-overlay" role="dialog" aria-modal="true" aria-label="Quick search">
      <div className="cmdk-scrim" onClick={() => setOpen(false)} />
      <div className="cmdk-panel">
        <div className="cmdk-header">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search clients, returns, invoices, or jump to a page…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            aria-controls="cmdk-results"
            aria-activedescendant={flat[active] ? `cmdk-i-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-results" id="cmdk-results" role="listbox">
          {groups.length === 0 ? (
            <div className="cmdk-empty">{loading ? "Searching…" : q.length < 2 ? "Type at least 2 characters." : "No matches."}</div>
          ) : (
            groups.map((g) => (
              <div className="cmdk-group" key={g.kind}>
                <div className="cmdk-group-label">
                  {KIND_META[g.kind]?.icon}
                  <span>{KIND_META[g.kind]?.label ?? g.kind}</span>
                </div>
                {g.items.map((item) => {
                  const flatIdx = flat.findIndex((f) => f.id === item.id && (f as NavItem).href === (item as NavItem).href);
                  const isActive = flatIdx === active;
                  return (
                    <button
                      key={`${g.kind}-${item.id}`}
                      id={flatIdx >= 0 ? `cmdk-i-${flatIdx}` : undefined}
                      role="option"
                      aria-selected={isActive}
                      className={`cmdk-i${isActive ? " is-active" : ""}`}
                      onMouseEnter={() => flatIdx >= 0 && setActive(flatIdx)}
                      onClick={() => go(item)}
                      type="button"
                    >
                      <span className="cmdk-i-label">{item.label}</span>
                      {"sub" in item && item.sub ? <span className="cmdk-i-sub">{item.sub}</span> : null}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> dismiss</span>
          <span className="cmdk-pad">Honore</span>
        </div>
      </div>
    </div>
  );
}