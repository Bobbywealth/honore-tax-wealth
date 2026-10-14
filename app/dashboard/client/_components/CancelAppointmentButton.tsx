"use client";

import { useState } from "react";

export default function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/appointments/${appointmentId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || "Could not cancel the appointment.");
      }
      setDone(true);
      // Refresh to show updated status
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the appointment.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (done) {
    return <span className="dashboard-tag">Cancelled</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="dashboard-button dashboard-button-secondary"
        onClick={() => setConfirming(true)}
      >
        Cancel appointment
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="dashboard-quiet" style={{ margin: 0 }}>Cancel this appointment?</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="dashboard-button dashboard-button-secondary"
          disabled={busy}
          onClick={handleCancel}
        >
          {busy ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          className="dashboard-button"
          disabled={busy}
          onClick={() => { setConfirming(false); setError(null); }}
        >
          Keep it
        </button>
      </div>
      {error ? <p style={{ color: "#a33", fontSize: 13, margin: 0 }}>{error}</p> : null}
    </div>
  );
}
