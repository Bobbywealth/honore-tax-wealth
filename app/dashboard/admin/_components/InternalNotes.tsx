"use client";

import { useEffect, useState } from "react";
import { StickyNote, Loader2 } from "lucide-react";

type Note = {
  id: string;
  authorName: string | null;
  authorRole: string | null;
  body: string;
  createdAt: string;
};

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

/**
 * Internal agent/admin notes timeline.
 *
 * NEVER rendered for clients — this component only mounts on the admin
 * client-detail page. Each note shows its author and timestamp so the
 * audit trail is visible when multiple people work an account.
 */
export default function InternalNotes({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) setNotes(data.notes ?? []);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError("Could not save the note. Try again.");
      } else {
        setBody("");
        await load();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-section" aria-labelledby="internal-notes">
      <div className="dashboard-section-head">
        <span className="dashboard-eyebrow">
          <StickyNote size={14} aria-hidden="true" /> INTERNAL NOTES
        </span>
        <h2 id="internal-notes">Agent notes &amp; follow-up</h2>
        <p className="dashboard-quiet">
          Private to the team — clients never see these. Use for missing
          documents, last contact, follow-ups, and filing notes.
        </p>
      </div>

      <form onSubmit={addNote} className="dashboard-note-form">
        <label htmlFor="note-body" className="sr-only">Add an internal note</label>
        <textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Called client 10/14 — sending missing W-2 by Friday. Follow up Monday if nothing arrives."
          rows={3}
          maxLength={5000}
          disabled={busy}
        />
        {error ? <p className="dashboard-alert-text" role="alert">{error}</p> : null}
        <button type="submit" className="dashboard-button" disabled={busy || !body.trim()}>
          {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
          {busy ? "Saving…" : "Add note"}
        </button>
      </form>

      {loading ? (
        <p className="dashboard-quiet">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="dashboard-quiet">No internal notes yet.</p>
      ) : (
        <ul className="dashboard-notes-list">
          {notes.map((n) => (
            <li key={n.id} className="dashboard-note">
              <div className="dashboard-note-head">
                <strong>{n.authorName ?? "Team member"}</strong>
                {n.authorRole ? <span className="dashboard-muted"> · {n.authorRole}</span> : null}
                <span className="dashboard-muted"> · {timeAgo(n.createdAt)}</span>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
