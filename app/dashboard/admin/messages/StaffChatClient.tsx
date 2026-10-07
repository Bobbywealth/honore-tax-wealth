"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, MessageSquareText, Search, Send } from "lucide-react";

type Sender = { id: string; name: string };
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  optimistic?: boolean;
};
type Thread = {
  id: string;
  subject: string;
  clientId: string;
  clientName: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { senderName: string; body: string; createdAt: string } | null;
};

type Counts = {
  unanswered: number;
  openAppointments: number;
  activeReturns: number;
  leadsTotal: number;
  conversationsUnread: number;
};

function dayBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
}
function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function StaffChatClient({
  initialThreads,
  initialThread,
  initialMessages,
  currentUserId,
  currentUserName,
  counts,
}: {
  initialThreads: Thread[];
  initialThread: { id: string; subject: string; clientId: string; clientName: string; messages: Message[]; participants: Sender[] } | null;
  initialMessages: Message[];
  currentUserId: string;
  currentUserName: string;
  counts: Counts;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThread?.id ?? null);
  const [threadMeta, setThreadMeta] = useState<{ id: string; subject: string; clientName: string } | null>(
    initialThread ? { id: initialThread.id, subject: initialThread.subject, clientName: initialThread.clientName } : null,
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "open">("all");
  const [search, setSearch] = useState("");
  const [pulse, setPulse] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === "unread") list = list.filter((t) => t.unread > 0);
    if (filter === "open") list = list.filter((t) => t.unread > 0 || (t.lastMessageAt && Date.now() - new Date(t.lastMessageAt).getTime() < 7 * 24 * 60 * 60 * 1000));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.subject.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q));
    }
    return list;
  }, [threads, filter, search]);

  const grouped = useMemo(() => {
    const out: Array<{ senderId: string; senderName: string; items: Message[]; day: string }> = [];
    for (const m of messages) {
      const day = dayBucket(m.createdAt);
      const last = out[out.length - 1];
      const prevLastTs = last ? new Date(last.items[last.items.length - 1].createdAt).getTime() : 0;
      if (last && last.day === day && last.senderId === m.senderId && Math.abs(new Date(m.createdAt).getTime() - prevLastTs) < 5 * 60 * 1000) {
        last.items.push(m);
      } else {
        const sender = m.senderId === currentUserId
          ? { id: currentUserId, name: currentUserName ?? "You" }
          : threadMeta?.clientName
            ? { id: m.senderId, name: threadMeta.clientName }
            : { id: m.senderId, name: "Client" };
        out.push({ senderId: sender.id, senderName: sender.name, items: [m], day });
      }
    }
    return out;
  }, [messages, threadMeta, currentUserId, currentUserName]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, messages.length]);

  const lastIdRef = useRef<string | null>(messages.length ? messages[messages.length - 1].id : null);
  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : null;
  }, [messages]);

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/conversations?status=${filter}&q=${encodeURIComponent(search)}`, { headers: { accept: "application/json" } });
        if (res.ok) {
          const json = (await res.json()) as { threads?: Thread[] };
          if (json.threads) setThreads(json.threads);
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [filter]);

  async function send() {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: optimisticId,
      conversationId: activeId,
      senderId: currentUserId,
      body: text,
      createdAt: new Date().toISOString(),
      readAt: null,
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? {
              ...t,
              lastMessageAt: optimistic.createdAt,
              lastMessage: { senderName: currentUserName ?? "You", body: text, createdAt: optimistic.createdAt },
              unread: 0,
            }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/admin/conversations/${activeId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("send_failed");
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      if (json.id) {
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, id: json.id!, optimistic: false } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, optimistic: false, body: m.body + " (failed to send — retry?)" } : m)));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function selectThread(id: string) {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/admin/conversations/${id}/thread`, { headers: { accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as { thread: { id: string; subject: string; clientId: string; clientName: string; messages: Message[]; participants: Sender[] } };
        setMessages(json.thread.messages);
        setThreadMeta({ id: json.thread.id, subject: json.thread.subject, clientName: json.thread.clientName });
      }
    } catch {
      // ignore
    }
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
  }

  return (
    <>
      <section className="adm-staff-kpis" aria-label="Staff chat summary">
        <article className={`adm-staff-kpi${counts.conversationsUnread > 0 ? " is-alert" : ""}`}>
          <small>Unread from clients</small>
          <strong>{counts.conversationsUnread}</strong>
          <p>{counts.conversationsUnread ? "Replies waiting on you." : "All caught up."}</p>
        </article>
        <article className="adm-staff-kpi">
          <small>Open threads</small>
          <strong>{threads.length}</strong>
          <p>Across every client.</p>
        </article>
        <article className="adm-staff-kpi">
          <small>Inbox queue</small>
          <strong>{counts.unanswered}</strong>
          <p>New consultation requests.</p>
        </article>
        <article className="adm-staff-kpi">
          <small>Active returns</small>
          <strong>{counts.activeReturns}</strong>
          <p>Being prepared right now.</p>
        </article>
      </section>

      <section className="chat-shell">
        <aside className="chat-rail">
          <div className="chat-rail-head">
            <span className="dashboard-eyebrow">CLIENT THREADS</span>
            <h2>Conversations</h2>
            <form className="chat-search" onSubmit={(e) => e.preventDefault()}>
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search client or subject…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search conversations"
              />
            </form>
            <div className="chat-filter-row">
              {([
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
                { key: "open", label: "Recent" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`chat-filter${filter === f.key ? " is-active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {filteredThreads.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No threads</h3>
              <p>{threads.length === 0 ? "Clients will appear here when they message." : "Try clearing the filter."}</p>
            </div>
          ) : (
            <ul className="chat-thread-list">
              {filteredThreads.map((t) => {
                const active = activeId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`chat-thread-i${active ? " is-active" : ""}${t.unread > 0 ? " is-unread" : ""}`}
                      onClick={() => selectThread(t.id)}
                      aria-current={active ? "page" : undefined}
                    >
                      <div className="chat-thread-avatar">{initials(t.clientName)}</div>
                      <div className="chat-thread-body">
                        <div className="chat-thread-row1">
                          <strong>{t.clientName}</strong>
                          {t.unread > 0 ? <span className="chat-thread-unread">{t.unread}</span> : null}
                        </div>
                        <span className="chat-thread-preview-subject">{t.subject}</span>
                        <span className="chat-thread-preview">
                          {t.lastMessage ? `${t.lastMessage.body.slice(0, 70)}${t.lastMessage.body.length > 70 ? "…" : ""}` : "Awaiting first reply."}
                        </span>
                        <span className="chat-thread-meta">{t.lastMessageAt ? relative(t.lastMessageAt) : ""}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <main className={`chat-pane${pulse ? " is-pulsing" : ""}`}>
          {activeId && threadMeta ? (
            <>
              <div className="chat-header">
                <div className="chat-header-body">
                  <strong>{threadMeta.clientName}</strong>
                  <span>Re: {threadMeta.subject}</span>
                </div>
                <div className="chat-header-actions">
                  <a className="dashboard-button dashboard-button-secondary" href={`/dashboard/admin/clients?focus=${threadMeta.id}`}>
                    Open client <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>

              <div className="chat-scroll" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="dashboard-empty">
                    <h3>No messages in this thread</h3>
                    <p>Send the first reply below.</p>
                  </div>
                ) : (
                  <ol className="chat-bubble-list">
                    {grouped.map((group, gi) => (
                      <li key={gi} className="chat-day-group">
                        <div className="chat-day-sep">
                          <span>{group.day}</span>
                        </div>
                        <div className={`chat-bubble-group is-${group.senderId === currentUserId ? "me" : "them"}`}>
                          <div className="chat-bubble-meta">
                            <span className="chat-bubble-name">{group.senderName}</span>
                            <span className="chat-bubble-time">{formatTime(group.items[group.items.length - 1].createdAt)}</span>
                          </div>
                          {group.items.map((m, mi) => (
                            <div
                              key={m.id}
                              className={`chat-bubble${m.optimistic ? " is-optimistic" : ""}${m.body.endsWith("(failed to send — retry?)") ? " is-failed" : ""}`}
                            >
                              <span className="chat-bubble-body">{m.body}</span>
                              <span className="chat-bubble-foot">
                                {m.optimistic ? (
                                  <em>sending…</em>
                                ) : (
                                  <>
                                    {formatTime(m.createdAt)}
                                    {m.senderId === currentUserId ? (
                                      <span className="chat-bubble-tick" aria-label={m.readAt ? "Read" : "Delivered"}>
                                        {m.readAt ? "✓✓" : "✓"}
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder="Type a reply…"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 4 * 24) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  disabled={sending}
                />
                <button type="submit" className="dashboard-button chat-send" disabled={sending || !draft.trim()}>
                  <Send size={14} aria-hidden="true" /> Send
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-state">
              <MessageSquareText size={48} aria-hidden="true" />
              <h2>Pick a conversation</h2>
              <p>Select a client thread from the left to read and reply. New ones show up at the top in real time.</p>
            </div>
          )}
        </main>
      </section>
    </>
  );
}