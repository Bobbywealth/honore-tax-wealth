"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import OpenChatButton from "./OpenChatButton";

/**
 * Inline "ask your preparer" composer for the client overview page.
 * Submits as JSON (so the API returns the new thread id instead of
 * redirecting to the removed messages page), then opens the chat widget
 * directly to the new thread.
 */
export default function QuickMessageForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const s = subject.trim();
    const b = body.trim();
    if (!s || !b || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: s, body: b }),
      });
      const json = (await res.json().catch(() => ({}))) as { conversationId?: string };
      if (!res.ok || !json.conversationId) throw new Error("send_failed");
      setSubject("");
      setBody("");
      window.dispatchEvent(
        new CustomEvent("open-client-chat", { detail: { threadId: json.conversationId } }),
      );
    } catch {
      setError("Could not send your message. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dashboard-quick-form" onSubmit={onSubmit}>
      <div className="dashboard-form-row">
        <label>
          Subject
          <input
            name="subject"
            required
            maxLength={200}
            placeholder="e.g. Question about my 1099"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <label className="dashboard-form-notes">
        Message
        <textarea
          name="body"
          required
          maxLength={4000}
          rows={3}
          placeholder="What can we help with?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
      </label>
      {error ? (
        <p role="alert" className="form-feedback is-err" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="dashboard-form-actions">
        <button type="submit" className="dashboard-button" disabled={busy}>
          {busy ? "Sending…" : <>Send to preparer <ArrowUpRight size={16} aria-hidden="true" /></>}
        </button>
        <OpenChatButton className="dashboard-button dashboard-button-secondary">
          Open messages
        </OpenChatButton>
      </div>
    </form>
  );
}
