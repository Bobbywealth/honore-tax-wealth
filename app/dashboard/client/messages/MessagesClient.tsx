"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessageSquareText, Send, Search } from "lucide-react";

type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  optimistic?: boolean;
  senderName?: string;
};
type Thread = {
  id: string;
  subject: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { senderName: string; body: string; createdAt: string } | null;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
}
function dayBucket(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/**
 * Full-page client messages experience. Mirrors the floating ChatLauncher
 * UX but lives at /dashboard/client/messages so the sidebar link and any
 * Reply button deep-link lands somewhere readable.
 */
export default function MessagesClient({
  currentUserId,
  currentUserName,
  threads: initialThreads,
  initialMessagesByThread,
}: {
  currentUserId: string;
  currentUserName: string;
  threads: Thread[];
  initialMessagesByThread: Record<string, Message[]>;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>(initialMessagesByThread);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Refresh thread list (every 6s) so unread counts and new threads surface.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/client/conversations", { headers: { accept: "application/json" } });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { threads?: Thread[] };
        if (Array.isArray(json.threads)) setThreads(json.threads);
      } catch {
        // ignore
      }
    }
    void refresh();
    const id = window.setInterval(refresh, 6000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Poll active thread every 4s for new messages.
  useEffect(() => {
    const threadId = activeId;
    if (!threadId) return;
    const tid: string = threadId;
    let cancelled = false;
    async function pull() {
      try {
        const list = messagesByThread[tid] ?? [];
        const lastId = list.length ? list[list.length - 1].id : "";
        const res = await fetch(`/api/client/conversations/${tid}/poll?since=${encodeURIComponent(lastId)}`, { headers: { accept: "application/json" } });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => ({}))) as { messages?: Message[] };
        const incoming = json.messages ?? [];
        if (incoming.length) {
          setMessagesByThread((prev) => {
            const current = prev[tid] ?? [];
            const known = new Set(current.map((m: Message) => m.id));
            const added = incoming.filter((m) => !known.has(m.id));
            if (!added.length) return prev;
            return { ...prev, [tid]: [...current, ...added] };
          });
        }
      } catch {
        // ignore
      }
    }
    void pull();
    const id = window.setInterval(pull, 4000);
    return () => { cancelled = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesByThread, activeId]);

  const messages = activeId ? messagesByThread[activeId] ?? [] : [];
  const activeThread = threads.find((t) => t.id === activeId);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === "unread") list = list.filter((t) => t.unread > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.subject.toLowerCase().includes(q));
    }
    return list;
  }, [threads, filter, search]);

  async function selectThread(id: string) {
    setActiveId(id);
    setMessagesByThread((prev) => {
      const next = { ...prev };
      if (!next[id]) next[id] = [];
      return next;
    });
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
    try {
      const res = await fetch(`/api/client/conversations/${id}/messages`, { headers: { accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as { thread: { id: string; messages: Message[] } };
        setMessagesByThread((prev) => ({ ...prev, [id]: json.thread.messages }));
      }
    } catch {
      // ignore
    }
  }

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
      senderName: currentUserName,
    };
    setMessagesByThread((prev) => ({ ...prev, [activeId]: [...(prev[activeId] ?? []), optimistic] }));
    setDraft("");
    try {
      const res = await fetch(`/api/client/conversations/${activeId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("send_failed");
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      if (json.id) {
        setMessagesByThread((prev) => {
          const list = prev[activeId] ?? [];
          return { ...prev, [activeId]: list.map((m) => (m.id === optimisticId ? { ...m, id: json.id!, optimistic: false } : m)) };
        });
      }
    } catch {
      setMessagesByThread((prev) => {
        const list = prev[activeId] ?? [];
        return { ...prev, [activeId]: list.map((m) => (m.id === optimisticId ? { ...m, optimistic: false, body: m.body + " (failed to send — retry?)" } : m)) };
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <aside className="chat-page-rail">
        <div className="chat-page-rail-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search threads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
        <div className="chat-popup-filter-row">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chat-popup-filter${filter === f ? " is-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : "Unread"}
            </button>
          ))}
        </div>
        <ul className="chat-page-thread-list">
          {filteredThreads.length === 0 ? (
            <li className="chat-popup-thread-empty">
              {threads.length === 0 ? "No messages yet. Send your first below." : "No matches."}
            </li>
          ) : (
            filteredThreads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`chat-page-thread-i${activeId === t.id ? " is-active" : ""}${t.unread > 0 ? " is-unread" : ""}`}
                  onClick={() => selectThread(t.id)}
                >
                  <div className="chat-thread-avatar">{initials(t.lastMessage?.senderName ?? "HT")}</div>
                  <div className="chat-page-thread-body">
                    <div className="chat-thread-row1">
                      <strong>{t.subject}</strong>
                      {t.unread > 0 ? <span className="chat-thread-unread">{t.unread}</span> : null}
                    </div>
                    <span className="chat-thread-preview">
                      {t.lastMessage ? `${t.lastMessage.body.slice(0, 80)}${t.lastMessage.body.length > 80 ? "\u2026" : ""}` : "Awaiting first reply."}
                    </span>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
        <form
          action="/api/client/conversations"
          method="post"
          className="chat-page-new-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const subject = String(fd.get("subject") ?? "").trim();
            const body = String(fd.get("body") ?? "").trim();
            if (!subject || !body) return;
            const res = await fetch("/api/client/conversations", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ subject, body }),
            });
            if (res.ok) {
              (e.currentTarget as HTMLFormElement).reset();
              const json = (await res.json()) as { conversationId: string };
              if (json.conversationId) {
                await selectThread(json.conversationId);
                const list = await fetch("/api/client/conversations", { headers: { accept: "application/json" } });
                const listJson = (await list.json()) as { threads: Thread[] };
                setThreads(listJson.threads);
              }
            }
          }}
        >
          <input name="subject" required maxLength={200} placeholder="New subject" />
          <textarea name="body" required maxLength={4000} rows={2} placeholder="Write a message\u2026" />
          <button type="submit"><Send size={14} aria-hidden="true" /> Send</button>
        </form>
      </aside>

      <section className="chat-page-pane" aria-label={activeThread ? `Conversation: ${activeThread.subject}` : "Pick a conversation"}>
        {activeId ? (
          <>
            <header className="chat-page-header">
              <strong>{activeThread?.subject}</strong>
              {activeThread?.unread === 0 && messages.length > 0 ? <span className="adm-tag gr">All caught up</span> : null}
            </header>
            <div className="chat-page-scroll" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="dashboard-empty">
                  <h3>No messages in this thread yet</h3>
                  <p>Send the first reply below.</p>
                </div>
              ) : (
                <ol className="chat-bubble-list">
                  {(() => {
                    const out: Array<{ senderId: string; senderName: string; items: Message[]; day: string }> = [];
                    for (const m of messages) {
                      const day = dayBucket(m.createdAt);
                      const last = out[out.length - 1];
                      if (last && last.day === day && last.senderId === m.senderId && Math.abs(m.createdAt.charCodeAt(0) - last.items[last.items.length - 1].createdAt.charCodeAt(0)) < 100000) {
                        last.items.push(m);
                      } else {
                        out.push({ senderId: m.senderId, senderName: m.senderName ?? (m.senderId === currentUserId ? currentUserName : "Honore Tax & Wealth"), items: [m], day });
                      }
                    }
                    return out.map((group, gi) => (
                      <li key={gi} className="chat-day-group">
                        <div className="chat-day-sep"><span>{group.day}</span></div>
                        <div className={`chat-bubble-group is-${group.senderId === currentUserId ? "me" : "them"}`}>
                          <div className="chat-bubble-meta">
                            <span className="chat-bubble-name">{group.senderName}</span>
                            <span className="chat-bubble-time">{formatTime(group.items[group.items.length - 1].createdAt)}</span>
                          </div>
                          {group.items.map((m) => (
                            <div key={m.id} className={`chat-bubble${m.optimistic ? " is-optimistic" : ""}`}>
                              <span className="chat-bubble-body">{m.body}</span>
                              <span className="chat-bubble-foot">
                                {m.optimistic ? (
                                  <em>sending\u2026</em>
                                ) : (
                                  <>
                                    {formatTime(m.createdAt)}
                                    {m.senderId === currentUserId ? <span className="chat-bubble-tick">{m.readAt ? "\u2713\u2713" : "\u2713"}</span> : null}
                                  </>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </li>
                    ));
                  })()}
                </ol>
              )}
            </div>

            <form
              className="chat-page-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                rows={1}
                placeholder="Type a reply\u2026"
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
            <p>Select a thread from the left to read and reply, or start a new one below.</p>
          </div>
        )}
      </section>
    </div>
  );
}
