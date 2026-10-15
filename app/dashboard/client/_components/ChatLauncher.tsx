"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessageSquareText, Send, Minus, X, Search } from "lucide-react";

type Sender = { id: string; name: string };
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
  name?: string;
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
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/**
 * Floating chat widget for the client portal. Mounts once at the shell and
 * persists open state across navigation. Click the floating button to open
 * the popup; the popup mirrors the previous dedicated-page chat (thread
 * list + bubble view + composer + 4-second poll) but as an overlay.
 */
export default function ChatLauncher({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [unreadTotal, setUnreadTotal] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load thread list once when the widget first mounts and every 5s.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/client/conversations", { headers: { accept: "application/json" } });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { threads?: Thread[] };
        if (Array.isArray(json.threads)) {
          setThreads(json.threads);
          setUnreadTotal(json.threads.reduce((s, t) => s + t.unread, 0));
          if (!activeId && json.threads[0]) setActiveId(json.threads[0].id);
        }
      } catch {
        // ignore
      }
    }
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeId]);

  // Poll messages for the active thread every 4s while open.
  useEffect(() => {
    if (!open || !activeId) return;
    let cancelled = false;
    async function pull() {
      try {
        const lastId = messages.length ? messages[messages.length - 1].id : "";
        const res = await fetch(
          `/api/client/conversations/${activeId}/poll?since=${encodeURIComponent(lastId)}`,
          { headers: { accept: "application/json" } },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { messages?: Message[] };
        if (json.messages && json.messages.length) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const added = json.messages!.filter((m) => !known.has(m.id));
            return added.length ? [...prev, ...added] : prev;
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
  }, [open, activeId]);

  // Auto-scroll to bottom when the active thread changes or new messages arrive.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeId]);

  // Allow page CTAs to open the widget programmatically:
  // window.dispatchEvent(new CustomEvent("open-client-chat", { detail: { threadId } }))
  useEffect(() => {
    function onOpenClientChat(e: Event) {
      const threadId = (e as CustomEvent<{ threadId?: string }>).detail?.threadId;
      setMinimized(false);
      setOpen(true);
      if (threadId) void selectThread(threadId);
    }
    window.addEventListener("open-client-chat", onOpenClientChat);
    return () => window.removeEventListener("open-client-chat", onOpenClientChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setMessages([]);
    try {
      const res = await fetch(`/api/client/conversations/${id}/messages`, { headers: { accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as { thread: { id: string; messages: Message[] } };
        setMessages(json.thread.messages);
      }
    } catch {
      // ignore
    }
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
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
    };
    setMessages((prev) => [...prev, optimistic]);
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
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, id: json.id!, optimistic: false } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, optimistic: false, body: m.body + " (failed to send — retry?)" } : m)));
    } finally {
      setSending(false);
    }
  }

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <>
      <button
        type="button"
        className="chat-launcher"
        aria-label={open ? "Close messages" : "Open messages"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MessageSquareText size={22} aria-hidden="true" />
        {unreadTotal > 0 ? <span className="chat-launcher-dot">{unreadTotal}</span> : null}
      </button>

      {open && !minimized ? (
        <div className="chat-popup" role="dialog" aria-label="Messages with your preparer">
          <div className="chat-popup-header">
            <div>
              <strong>{activeThread?.name || currentUserName}</strong>
              <span>Re: {activeThread?.subject || "Messages with your preparer"}</span>
            </div>
            <div className="chat-popup-header-actions">
              <button type="button" aria-label="Minimize" onClick={() => setMinimized(true)}>
                <Minus size={16} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="chat-popup-body">
            <aside className="chat-popup-rail">
              <div className="chat-popup-rail-search">
                <Search size={13} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
              <ul className="chat-popup-thread-list">
                {filteredThreads.length === 0 ? (
                  <li className="chat-popup-thread-empty">
                    {threads.length === 0 ? "No threads yet. Send your first message below." : "No matches."}
                  </li>
                ) : (
                  filteredThreads.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`chat-popup-thread-i${activeId === t.id ? " is-active" : ""}${t.unread > 0 ? " is-unread" : ""}`}
                        onClick={() => selectThread(t.id)}
                      >
                        <div className="chat-thread-avatar">{initials(t.lastMessage?.senderName ?? "HT")}</div>
                        <div className="chat-popup-thread-body">
                          <div className="chat-thread-row1">
                            <strong>{t.subject}</strong>
                            {t.unread > 0 ? <span className="chat-thread-unread">{t.unread}</span> : null}
                          </div>
                          <span className="chat-thread-preview">
                            {t.lastMessage ? `${t.lastMessage.body.slice(0, 80)}${t.lastMessage.body.length > 80 ? "…" : ""}` : "Awaiting first reply."}
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
                className="chat-popup-new-form"
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
                <textarea name="body" required maxLength={4000} rows={2} placeholder="Write a message…" />
                <button type="submit"><Send size={14} aria-hidden="true" /> Send</button>
              </form>
            </aside>

            <main className="chat-popup-pane">
              {activeId ? (
                <>
                  <div className="chat-popup-scroll" ref={scrollRef}>
                    {messages.length === 0 ? (
                      <div className="dashboard-empty" style={{ margin: 20 }}>
                        <h3>No messages in this thread</h3>
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
                              const sender = m.senderId === currentUserId
                                ? { id: currentUserId, name: currentUserName }
                                : { id: m.senderId, name: m.senderName ?? "iHonore Tax & Wealth" };
                              out.push({ senderId: sender.id, senderName: sender.name, items: [m], day });
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
                                      {m.optimistic ? <em>sending…</em> : (
                                        <>
                                          {formatTime(m.createdAt)}
                                          {m.senderId === currentUserId ? <span className="chat-bubble-tick">{m.readAt ? "✓✓" : "✓"}</span> : null}
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
                    className="chat-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
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
                  <h2>Pick a thread</h2>
                  <p>Pick a thread from the left to read and reply, or start a new one below.</p>
                </div>
              )}
            </main>
          </div>
        </div>
      ) : open && minimized ? (
        <button
          type="button"
          className="chat-launcher chat-launcher-mini"
          aria-label="Open messages"
          onClick={() => setMinimized(false)}
        >
          <MessageSquareText size={18} aria-hidden="true" />
          <span>Messages</span>
          {unreadTotal > 0 ? <span className="chat-launcher-dot">{unreadTotal}</span> : null}
          <ArrowDown size={12} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}