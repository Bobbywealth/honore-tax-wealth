"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MessageSquareText, CheckCircle2, Send } from "lucide-react";

type Sender = { id: string; name: string };
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string; // ISO
  readAt: string | null;
  optimistic?: boolean;
};
type Thread = {
  id: string;
  subject: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { senderName: string; body: string; createdAt: string } | null;
};

type Counts = {
  activeEngagements: number;
  openRequests: number;
  upcomingAppointments: number;
  unpaidInvoices: number;
  unreadMessages: number;
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

export default function ChatClient({
  initialThreads,
  initialThread,
  initialMessages,
  currentUserId,
  counts,
}: {
  initialThreads: Thread[];
  initialThread: { id: string; subject: string; messages: Message[]; participants: Sender[] } | null;
  initialMessages: Message[];
  currentUserId: string;
  counts: Counts;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThread?.id ?? null);
  const [threadMeta, setThreadMeta] = useState<{ id: string; subject: string; participants: Sender[] } | null>(
    initialThread ? { id: initialThread.id, subject: initialThread.subject, participants: initialThread.participants } : null,
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [pulse, setPulse] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Group messages into consecutive runs by sender so the bubble layout is
  // tighter (Slack/WhatsApp style).
  const grouped = useMemo(() => {
    const out: Array<{ senderId: string; senderName: string; items: Message[]; day: string }> = [];
    for (const m of messages) {
      const day = dayBucket(m.createdAt);
      const last = out[out.length - 1];
      const prevLastTs = last ? new Date(last.items[last.items.length - 1].createdAt).getTime() : 0;
      if (last && last.day === day && last.senderId === m.senderId && Math.abs(new Date(m.createdAt).getTime() - prevLastTs) < 5 * 60 * 1000) {
        last.items.push(m);
      } else {
        const sender = m.senderId === currentUserId ? { id: currentUserId, name: "You" } : threadMeta?.participants.find((p) => p.id === m.senderId) ?? { id: m.senderId, name: "Honoré Tax & Wealth" };
        out.push({ senderId: sender.id, senderName: sender.name, items: [m], day });
      }
    }
    return out;
  }, [messages, threadMeta, currentUserId]);

  // Scroll to bottom whenever the active thread changes or messages arrive.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, messages.length]);

  // Live polling: every 4s, fetch messages for the active thread since the
  // last one we have, plus a thread list refresh so the unread badge updates.
  const lastIdRef = useRef<string | null>(messages.length ? messages[messages.length - 1].id : null);
  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : null;
  }, [messages]);

  useEffect(() => {
    if (!activeId) return;
    const id = window.setInterval(async () => {
      try {
        const url = `/api/client/conversations/${activeId}/poll?since=${encodeURIComponent(lastIdRef.current ?? "")}`;
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) return;
        const json = (await res.json()) as { messages?: Message[]; threadLastMessageAt?: string | null };
        if (json.messages && json.messages.length) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const added = json.messages!.filter((m) => !known.has(m.id));
            return added.length ? [...prev, ...added] : prev;
          });
          setPulse(true);
          window.setTimeout(() => setPulse(false), 1500);
        }
      } catch {
        // network blip — retry on next tick
      }
      try {
        const tr = await fetch(`/api/client/conversations`, { headers: { accept: "application/json" } });
        if (tr.ok) {
          const json = (await tr.json()) as { threads?: Thread[] };
          if (json.threads) setThreads(json.threads);
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [activeId]);

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
              lastMessage: { senderName: "You", body: text, createdAt: optimistic.createdAt },
              unread: 0,
            }
          : t,
      ),
    );
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
      // mark optimistic as failed
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, optimistic: false, body: m.body + " (failed to send — retry?)" } : m)));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function selectThread(id: string) {
    setActiveId(id);
    setMessages([]); // will reload via poll or immediate fetch
    try {
      const res = await fetch(`/api/client/conversations/${id}/messages`, { headers: { accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as { thread: { id: string; subject: string; messages: Message[]; participants: Sender[] } };
        setMessages(json.thread.messages);
        setThreadMeta({ id: json.thread.id, subject: json.thread.subject, participants: json.thread.participants });
      }
    } catch {
      // ignore
    }
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
  }

  function startNewThread() {
    setActiveId(null);
    setMessages([]);
    setThreadMeta(null);
  }

  return (
    <>
      <section className="client-kpi-strip" aria-label="Chat summary">
        <article className={`client-kpi${counts.unreadMessages > 0 ? " is-alert" : ""}`}>
          <small>Unread</small>
          <strong>{counts.unreadMessages}</strong>
          <p>{counts.unreadMessages ? "Replies waiting for you." : "All caught up."}</p>
        </article>
        <article className="client-kpi">
          <small>Open threads</small>
          <strong>{threads.length}</strong>
          <p>With Honoré Tax & Wealth.</p>
        </article>
        <article className="client-kpi">
          <small>Average reply</small>
          <strong>1 business day</strong>
          <p>48 hrs during tax season.</p>
        </article>
      </section>

      <section className="chat-shell">
        <aside className="chat-rail">
          <div className="chat-rail-head">
            <span className="dashboard-eyebrow">THREADS</span>
            <h2>Conversations</h2>
            <button type="button" className="dashboard-button dashboard-button-secondary chat-new" onClick={startNewThread}>
              <MessageSquareText size={14} aria-hidden="true" /> New
            </button>
          </div>
          {threads.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No threads yet</h3>
              <p>Start a new conversation below.</p>
            </div>
          ) : (
            <ul className="chat-thread-list">
              {threads.map((t) => {
                const active = activeId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`chat-thread-i${active ? " is-active" : ""}${t.unread > 0 ? " is-unread" : ""}`}
                      onClick={() => selectThread(t.id)}
                      aria-current={active ? "page" : undefined}
                    >
                      <div className="chat-thread-avatar">{t.lastMessage ? initials(t.lastMessage.senderName) : "HT"}</div>
                      <div className="chat-thread-body">
                        <div className="chat-thread-row1">
                          <strong>{t.subject}</strong>
                          {t.unread > 0 ? <span className="chat-thread-unread">{t.unread}</span> : null}
                        </div>
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
                <button type="button" className="chat-back" onClick={startNewThread} aria-label="Back to threads">
                  ←
                </button>
                <div className="chat-header-body">
                  <strong>{threadMeta.subject}</strong>
                  <span>
                    {threadMeta.participants.length} participant{threadMeta.participants.length === 1 ? "" : "s"}
                    {otherTyping ? " · typing…" : ""}
                  </span>
                </div>
                <div className="chat-header-actions">
                  <Link href="/dashboard/client" className="dashboard-button dashboard-button-secondary">
                    Overview <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="chat-scroll" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="dashboard-empty">
                    <h3>This thread is empty</h3>
                    <p>Send the first message below.</p>
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
                            <div key={m.id} className={`chat-bubble${m.optimistic ? " is-optimistic" : ""}${m.body.endsWith("(failed to send — retry?)") ? " is-failed" : ""}`}>
                              <span className="chat-bubble-body">{m.body}</span>
                              <span className="chat-bubble-foot">
                                  {m.optimistic ? <em>sending…</em> : (
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
                {otherTyping ? (
                  <div className="chat-typing">
                    <span className="chat-typing-dot" /><span className="chat-typing-dot" /><span className="chat-typing-dot" />
                    <em>Honoré Tax & Wealth is typing…</em>
                  </div>
                ) : null}
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
                    // Auto-resize up to 4 rows.
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
              <h2>Start a new conversation</h2>
              <p>Send a message and your preparer will reply here.</p>
              <form
                action="/api/client/conversations"
                method="post"
                className="dashboard-quick-form chat-new-chat"
              >
                <div className="dashboard-form-row">
                  <label>
                    Subject
                    <input name="subject" required maxLength={200} placeholder="e.g. Question about my 1099" />
                  </label>
                </div>
                <label className="dashboard-form-notes">
                  Message
                  <textarea name="body" required maxLength={4000} rows={4} placeholder="What can we help with?" />
                </label>
                <div className="dashboard-form-actions">
                  <button type="submit" className="dashboard-button">
                    <Send size={14} aria-hidden="true" /> Send to preparer
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </section>
    </>
  );
}