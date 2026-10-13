"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, X } from "lucide-react";

/**
 * Simple single-panel appointment request dialog for LOGGED-IN clients.
 *
 * This is deliberately NOT the 5-step prospect consultation dialog
 * (app/_components/ConsultationDialog.tsx): clients already have their
 * contact details on file, so this asks only what they need, when works,
 * and how they want to meet — then POSTs to /api/client/appointments.
 *
 * Mounted once in app/dashboard/client/layout.tsx. Any element in the
 * client portal with the `data-open-appointment-request` attribute opens
 * it (mirrors the public `data-open-consultation` pattern).
 */
export const APPOINTMENT_REQUEST_TRIGGER = "data-open-appointment-request";

const TOPICS = [
  "Quick question",
  "Document review",
  "Tax planning call",
  "IRS notice help",
  "Other",
] as const;

const MEETING_TYPES = [
  { value: "phone", label: "Phone call" },
  { value: "video", label: "Video call" },
  { value: "in_person", label: "In person" },
] as const;

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function AppointmentRequestDialog() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [meetingType, setMeetingType] = useState<string>("phone");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(
        `[${APPOINTMENT_REQUEST_TRIGGER}]`,
      );
      if (el) {
        e.preventDefault();
        setDone(false);
        setError(null);
        setOpen(true);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          preferredDate: date,
          preferredTime: time,
          meetingType,
          notes: notes.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error === "rate_limited" ? "rate_limited" : "send_failed");
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "rate_limited"
          ? "Too many requests — please wait a few minutes and try again."
          : "Could not send your request. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="appt-req-overlay" onClick={() => setOpen(false)}>
      <div
        className="appt-req-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-req-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="appt-req-head">
          <div>
            <span className="dashboard-eyebrow">APPOINTMENT REQUEST</span>
            <h2 id="appt-req-title">Book time with your preparer</h2>
            <p>Tell us what you need and when works — we&apos;ll confirm a time.</p>
          </div>
          <button
            type="button"
            className="appt-req-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <div className="appt-req-success" role="status">
            <strong>Request sent — we&apos;ll confirm a time.</strong>
            <p>
              Your preparer will review your request and confirm shortly. You can
              see it under Appointments.
            </p>
            <button
              type="button"
              className="dashboard-button"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        ) : (
          <form className="appt-req-form" onSubmit={onSubmit}>
            <div className="dashboard-form-row">
              <label>
                What do you need help with?
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={busy}
                >
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dashboard-form-row appt-req-grid-2">
              <label>
                Preferred date
                <input
                  type="date"
                  required
                  min={todayLocal()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Preferred time
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <fieldset className="appt-req-meeting">
              <legend>How should we meet?</legend>
              <div className="appt-req-pills">
                {MEETING_TYPES.map((m) => (
                  <label
                    key={m.value}
                    className={
                      meetingType === m.value ? "appt-req-pill is-active" : "appt-req-pill"
                    }
                  >
                    <input
                      type="radio"
                      name="appt-meeting-type"
                      value={m.value}
                      checked={meetingType === m.value}
                      onChange={() => setMeetingType(m.value)}
                      disabled={busy}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="dashboard-form-notes">
              Notes (optional)
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Anything we should know beforehand?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </label>
            {error ? (
              <p role="alert" className="form-feedback is-err">
                {error}
              </p>
            ) : null}
            <div className="dashboard-form-actions">
              <button type="submit" className="dashboard-button" disabled={busy}>
                {busy ? (
                  "Sending…"
                ) : (
                  <>
                    Send request <ArrowUpRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
              <button
                type="button"
                className="dashboard-button dashboard-button-secondary"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
