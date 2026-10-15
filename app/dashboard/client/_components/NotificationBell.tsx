"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

type Item = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * In-app notification bell for the client portal.
 * Polls every 60s; badge shows unread count.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const res = await fetch("/api/client/notifications");
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  async function markAllRead() {
    try {
      await fetch("/api/client/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
    } catch {
      // best-effort
    }
  }

  return (
    <div className="notif-bell-wrap">
      <button
        type="button"
        className="notif-bell"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 ? <span className="notif-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            {unread > 0 ? (
              <button type="button" className="notif-mark" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="notif-empty">You are all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id} className={n.read ? "is-read" : "is-unread"}>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
