"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eraser, PenLine, ShieldCheck, Type } from "lucide-react";

type TemplateSigner = { role: string; label: string; required: boolean };

type Props = {
  documentId: string;
  userDisplayName: string;
  userEmail: string;
  requiredSigners: number;
  esignConsent: string;
  templateSigners: TemplateSigner[];
};

type Mode = "drawn" | "typed";

/**
 * Client-side sign widget for in-app signing. Two modes:
 *  - "drawn": HTML5 canvas with pointer + touch events, captured as a
 *    base64 PNG dataURL. Best for natural-looking signatures.
 *  - "typed": the user types their name, we render it in a cursive font
 *    on a canvas and store the dataURL.
 *
 * Both modes submit the same `signatureData` to /api/client/signatures
 * along with the ESIGN consent text. The server records IP + UA + signed
 * timestamp and flips the document to 'signed' once the required-signer
 * threshold is met.
 */
export default function SignFormClient({
  documentId,
  userDisplayName,
  userEmail,
  requiredSigners,
  esignConsent,
  templateSigners,
}: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>("drawn");
  const [typed, setTyped] = useState<string>(userDisplayName);
  const [signerName, setSignerName] = useState<string>(userDisplayName);
  const [signerEmail, setSignerEmail] = useState<string>(userEmail);
  const [signerRole, setSignerRole] = useState<string>(templateSigners[0]?.role ?? "client");
  const [agreed, setAgreed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState<boolean>(false);

  // Wire up canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#0a1828";

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      drawing = true;
      const p = pos(e);
      lastX = p.x;
      lastY = p.y;
      // dot for tap
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#0a1828";
      ctx.fill();
    };

    const move = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
      if (!hasInk) setHasInk(true);
    };

    const up = () => {
      drawing = false;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [hasInk]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const captureSignature = (): { data: string; ok: boolean } => {
    if (mode === "drawn") {
      const canvas = canvasRef.current;
      if (!canvas) return { data: "", ok: false };
      if (!hasInk) return { data: "", ok: false };
      return { data: canvas.toDataURL("image/png"), ok: true };
    }
    if (!typed.trim()) return { data: "", ok: false };
    const offscreen = document.createElement("canvas");
    offscreen.width = 600;
    offscreen.height = 180;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return { data: "", ok: false };
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = "#0a1828";
    ctx.textBaseline = "middle";
    ctx.font = "italic 64px 'Snell Roundhand','Brush Script MT','Lucida Handwriting','Apple Chancery',cursive";
    ctx.fillText(typed.trim(), 24, offscreen.height / 2);
    return { data: offscreen.toDataURL("image/png"), ok: true };
  };

  const submit = async () => {
    setError(null);
    if (!signerName.trim()) {
      setError("Enter the printed name on the signature line.");
      return;
    }
    if (!agreed) {
      setError("You must agree to the Electronic Signature and Consent before signing.");
      return;
    }
    const captured = captureSignature();
    if (!captured.ok) {
      setError(mode === "drawn" ? "Please draw your signature in the box." : "Type your full legal name to use as a typed signature.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/client/signatures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim(),
          signerRole,
          signatureType: mode,
          signatureData: captured.data,
          consent: { agreed: true, consentText: esignConsent },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        setError(body?.error ? `Could not save: ${body.error}` : "Could not save the signature. Try again.");
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="dashboard-eyebrow" style={{ color: "#0a1828" }}>
        <PenLine size={12} aria-hidden="true" /> Your signature
      </div>
      <h3 style={{ font: "700 18px Fraunces,Georgia,serif", marginTop: 6 }}>Sign here</h3>
      <p className="dashboard-sm" style={{ color: "#5b6a78", marginTop: 4 }}>
        Draw with your mouse / trackpad / finger, or switch to typed mode. Your signature is bound to this form
        and the document is locked once everyone required has signed.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setMode("drawn")}
          className={`adm-btn ${mode === "drawn" ? "" : "adm-btn-ghost"}`}
          style={mode === "drawn" ? {} : { background: "#f1ede2", color: "#0e1a26", boxShadow: "none", border: "1px solid #d6dce1" }}
        >
          <PenLine size={12} aria-hidden="true" /> Draw
        </button>
        <button
          type="button"
          onClick={() => setMode("typed")}
          className={`adm-btn ${mode === "typed" ? "" : "adm-btn-ghost"}`}
          style={mode === "typed" ? {} : { background: "#f1ede2", color: "#0e1a26", boxShadow: "none", border: "1px solid #d6dce1" }}
        >
          <Type size={12} aria-hidden="true" /> Type
        </button>
        {mode === "drawn" ? (
          <button type="button" onClick={clearCanvas} className="adm-btn adm-btn-ghost" style={{ background: "#f1ede2", color: "#0e1a26", boxShadow: "none", border: "1px solid #d6dce1", marginLeft: "auto" }}>
            <Eraser size={12} aria-hidden="true" /> Clear
          </button>
        ) : null}
      </div>

      {mode === "drawn" ? (
        <div style={{ position: "relative", border: "2px dashed #dabc88", borderRadius: 12, background: "#fffaf2", height: 180, overflow: "hidden" }}>
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }} aria-label="Signature drawing area" />
          <div style={{ position: "absolute", bottom: 8, right: 12, font: "italic 12px 'DM Sans',sans-serif", color: "#9aa3aa" }}>Sign above the line</div>
          <div style={{ position: "absolute", bottom: 28, left: 12, right: 12, borderTop: "1px solid #d6dce1" }} />
        </div>
      ) : (
        <div style={{ border: "2px dashed #dabc88", borderRadius: 12, background: "#fffaf2", padding: 16 }}>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your full legal name"
            style={{
              width: "100%",
              border: "0",
              outline: "none",
              background: "transparent",
              font: "italic 36px 'Snell Roundhand','Brush Script MT','Lucida Handwriting','Apple Chancery',cursive",
              color: "#0a1828",
              padding: "8px 4px",
              minHeight: 64,
            }}
            aria-label="Typed signature"
          />
          <div style={{ borderTop: "1px solid #d6dce1", marginTop: 4 }} />
          <div style={{ font: "italic 10px 'DM Sans',sans-serif", color: "#9aa3aa", marginTop: 2 }}>This will be rendered as a script-style signature image.</div>
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label htmlFor="signer-name" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Printed name *</label>
          <input
            id="signer-name"
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            required
            maxLength={160}
            style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%", font: "400 14px 'DM Sans',sans-serif" }}
          />
        </div>
        <div>
          <label htmlFor="signer-role" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Role</label>
          <select
            id="signer-role"
            value={signerRole}
            onChange={(e) => setSignerRole(e.target.value)}
            style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%", font: "400 14px 'DM Sans',sans-serif" }}
          >
            {templateSigners.map((s) => (
              <option key={s.role} value={s.role}>{s.label}{s.required ? " *" : ""}</option>
            ))}
            <option value="representative">Authorized representative</option>
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="signer-email" style={{ display: "block", font: "600 10px Manrope,sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: "#5b6a78", marginBottom: 4 }}>Email (used for the audit trail)</label>
          <input
            id="signer-email"
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            maxLength={180}
            style={{ height: 42, padding: "0 12px", borderRadius: 7, border: "1px solid #d6dce1", background: "#fff", width: "100%", font: "400 14px 'DM Sans',sans-serif" }}
          />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18, padding: 14, background: "#faf9f5", border: "1px solid #d6dce1", borderRadius: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ font: "400 12px/1.5 'DM Sans',sans-serif", color: "#0e1a26" }}>
          <ShieldCheck size={12} aria-hidden="true" style={{ verticalAlign: "-1px", color: "#9a7a2e" }} />{" "}
          {esignConsent}
        </span>
      </label>

      {error ? (
        <div className="dashboard-alert" style={{ marginTop: 10, color: "#a63b37" }}>{error}</div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={submit} disabled={submitting} className="adm-btn">
          {submitting ? "Saving…" : (<><CheckCircle2 size={14} aria-hidden="true" /> Submit signature</>)}
        </button>
        <span className="dashboard-sm" style={{ color: "#5b6a78" }}>
          {requiredSigners === 1
            ? "Your signature finalises the form."
            : `After you sign, up to ${requiredSigners - 1} more signer${requiredSigners - 1 === 1 ? "" : "s"} may need to sign.`}
        </span>
      </div>
    </div>
  );
}
