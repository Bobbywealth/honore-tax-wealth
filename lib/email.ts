import { Resend } from "resend";

/**
 * Transactional email via Resend (GitHub issue #13, phase P6).
 *
 * Two messages go out when a consultation is submitted:
 *   1. A confirmation to the prospective client.
 *   2. A notification to the practice so a lead is never lost.
 *
 * Design rules, consistent with the rest of this codebase:
 *   - Email is NEVER load-bearing. A send failure must not fail the request
 *     that already persisted the lead, so this module never throws.
 *   - If Resend is not configured (local dev, first deploy) the caller gets a
 *     `not_configured` result and the lead is simply stored.
 *   - Logs carry no PII. Any upstream error text is redacted before logging.
 *   - All interpolated values are HTML-escaped; the submitted `message` is
 *     attacker-controlled and is rendered into both email bodies.
 */

const NAVY = "#0e1927";
const GOLD = "#bd9658";
const CREAM = "#f7f5ef";
const MUTED = "#5a6672";
const BORDER = "#e3e0d6";

const PRACTICE = "Honore Tax & Wealth";

/** Absolute site origin used for links in transactional email. */
const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://honore-tax-wealth.onrender.com"
).replace(/\/+$/, "");

export type ConsultationLead = {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

export type MailResult =
  | { ok: true; client: boolean; staff: boolean }
  | { ok: false; reason: "not_configured" | "send_failed" };

/** Escape a value for interpolation into an HTML body or attribute. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip anything email-shaped out of an upstream error before it is logged. */
function redact(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").slice(0, 200);
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Where practice-side notifications are delivered. */
export function notifyAddress(): string | null {
  const explicit = process.env.CONSULTATION_NOTIFY_EMAIL?.trim();
  if (explicit) return explicit;
  const admin = process.env.ADMIN_EMAIL?.trim();
  return admin || null;
}

function shell(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-top:4px solid ${GOLD};">
  <tr><td style="padding:32px 36px 8px;">
    <p style="margin:0;font:700 11px/1 Georgia,serif;letter-spacing:.22em;text-transform:uppercase;color:${GOLD};">${escapeHtml(PRACTICE)}</p>
    <h1 style="margin:14px 0 0;font:400 30px/1.2 Georgia,serif;letter-spacing:-.02em;color:${NAVY};">${heading}</h1>
  </td></tr>
  <tr><td style="padding:20px 36px 8px;font:400 16px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#39434d;">${body}</td></tr>
  <tr><td style="padding:24px 36px 34px;">
    <p style="margin:0;padding-top:20px;border-top:1px solid ${BORDER};font:400 12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${MUTED};">
      ${escapeHtml(PRACTICE)}<br />
      This message relates to a request you submitted. Please do not send tax documents, Social Security numbers, or account numbers by email.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function confirmationHtml(lead: ConsultationLead): string {
  const firstName = escapeHtml(lead.name.split(/\s+/)[0] || lead.name);
  return shell(
    `Thank you, ${firstName}`,
    `<p style="margin:0 0 18px;">We received your consultation request and a member of our team will reach out within one business day.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;border:1px solid ${BORDER};border-left:3px solid ${GOLD};width:100%;">
       <tr><td style="padding:18px 20px;font:400 15px/1.7 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#39434d;">
         <strong style="display:block;font:700 10px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">What you asked about</strong>
         ${escapeHtml(lead.service)}<br />
         <span style="color:${MUTED};">Best phone: ${escapeHtml(lead.phone)}</span>
       </td></tr>
     </table>
     <p style="margin:0 0 14px;">If you would like to add anything before we call, simply reply to this email.</p>
     <p style="margin:0;color:${MUTED};font-size:14px;">Please note this is a request for contact, not tax advice, and does not create a client relationship until an engagement letter is signed.</p>`,
  );
}

export function notificationHtml(lead: ConsultationLead, receivedAt: Date): string {
  const rows: Array<[string, string]> = [
    ["Name", escapeHtml(lead.name)],
    ["Email", `<a href="mailto:${escapeHtml(lead.email)}" style="color:${NAVY};">${escapeHtml(lead.email)}</a>`],
    ["Phone", `<a href="tel:${escapeHtml(lead.phone.replace(/[^\d+]/g, ""))}" style="color:${NAVY};">${escapeHtml(lead.phone)}</a>`],
    ["Service", escapeHtml(lead.service)],
    ["Received", escapeHtml(receivedAt.toISOString())],
  ];
  const messageBlock = lead.message
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;width:100%;border:1px solid ${BORDER};">
         <tr><td style="padding:18px 20px;font:400 15px/1.7 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#39434d;white-space:pre-wrap;">${escapeHtml(lead.message)}</td></tr>
       </table>`
    : `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;">No message was included.</p>`;

  return shell(
    "New consultation request",
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font:400 15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
      ${rows
        .map(
          ([k, v]) =>
            `<tr>
               <td style="padding:9px 0;border-bottom:1px solid ${BORDER};width:110px;vertical-align:top;font:700 10px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};">${k}</td>
               <td style="padding:9px 0;border-bottom:1px solid ${BORDER};color:${NAVY};">${v}</td>
             </tr>`,
        )
        .join("")}
    </table>
    ${messageBlock}
    <p style="margin:20px 0 0;font-size:14px;color:${MUTED};">Reply directly to this email to reach the sender.</p>`,
  );
}

function confirmationText(lead: ConsultationLead): string {
  const firstName = lead.name.split(/\s+/)[0] || lead.name;
  return [
    `Thank you, ${firstName}.`,
    "",
    `We received your consultation request and a member of our team will reach out within one business day.`,
    "",
    "What you asked about",
    `  Service: ${lead.service}`,
    `  Best phone: ${lead.phone}`,
    "",
    "If you would like to add anything before we call, simply reply to this email.",
    "",
    "Please note this is a request for contact, not tax advice, and does not create a client relationship until an engagement letter is signed.",
    "",
    PRACTICE,
  ].join("\n");
}

function notificationText(lead: ConsultationLead, receivedAt: Date): string {
  const lines = [
    "New consultation request",
    "",
    `Name:     ${lead.name}`,
    `Email:    ${lead.email}`,
    `Phone:    ${lead.phone}`,
    `Service:  ${lead.service}`,
    `Received: ${receivedAt.toISOString()}`,
    "",
    "Message:",
    lead.message || "(none)",
    "",
    "Reply directly to this email to reach the sender.",
    "",
    PRACTICE,
  ];
  return lines.join("\n");
}

/**
 * Sends the client confirmation and the practice notification.
 * Never throws: callers treat the result as advisory.
 */
export async function sendConsultationEmails(lead: ConsultationLead): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const staff = notifyAddress();
  if (!apiKey || !from || !staff) return { ok: false, reason: "not_configured" };

  const receivedAt = new Date();
  const resend = new Resend(apiKey);
  const clientSubject = "We received your request";
  const staffSubject = `New consultation request — ${lead.service}`;

  try {
    const [client, practice] = await Promise.all([
      resend.emails.send({
        from,
        to: lead.email,
        subject: clientSubject,
        html: confirmationHtml(lead),
        text: confirmationText(lead),
        // Replying to the confirmation reaches the practice, not the client.
        replyTo: staff,
      }),
      resend.emails.send({
        from,
        to: staff,
        subject: staffSubject,
        html: notificationHtml(lead, receivedAt),
        text: notificationText(lead, receivedAt),
        // Replying to the notification reaches the prospective client.
        replyTo: lead.email,
      }),
    ]);

    const clientError = client.error;
    const staffError = practice.error;
    if (clientError || staffError) {
      const which = clientError ? "client" : "staff";
      const detail = redact(
        String((clientError ?? staffError)?.message ?? "unknown error"),
      );
      console.log(
        JSON.stringify({
          ts: receivedAt.toISOString(),
          event: "email.partial_failure",
          which,
          detail,
        }),
      );
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true, client: true, staff: true };
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : "unknown error");
    console.log(
      JSON.stringify({
        ts: receivedAt.toISOString(),
        event: "email.error",
        detail,
      }),
    );
    return { ok: false, reason: "send_failed" };
  }
}
/* ======================= Account security mail ======================= */

/**
 * Sends a password reset link.
 *
 * The link carries an opaque token, never the password, and the token is
 * single-use with a one-hour expiry. Never throws: if this fails the account
 * is untouched and the user can retry.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  const link = `${SITE_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Honore Tax & Wealth password";

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: email,
      subject,
      html: shell(
        "Reset your password",
        `<p>We received a request to reset the password for your Honore Tax &amp; Wealth account.</p>
         <p><a href="${escapeHtml(link)}" style="display:inline-block;background:${NAVY};color:#fff;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700">Choose a new password</a></p>
         <p style="color:${MUTED};font-size:13px">This link expires in one hour and can be used once. If you did not request a reset, you can ignore this email — your password will not change.</p>`,
      ),
      text: `We received a request to reset your Honore Tax & Wealth password.\n\nChoose a new password: ${link}\n\nThis link expires in one hour and can be used once. If you did not request a reset, ignore this email.`,
    });
    if (result.error) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "email.reset_failed",
          detail: redact(String(result.error.message ?? "unknown")),
        }),
      );
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true, client: true, staff: false };
  } catch (error) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "email.reset_error",
        detail: redact(error instanceof Error ? error.message : "unknown error"),
      }),
    );
    return { ok: false, reason: "send_failed" };
  }
}

/** Sends an address-verification link. */
export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  const link = `${SITE_ORIGIN}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your email address";

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: email,
      subject,
      html: shell(
        "Confirm your email address",
        `<p>Please confirm this email address to finish setting up your Honore Tax &amp; Wealth account.</p>
         <p><a href="${escapeHtml(link)}" style="display:inline-block;background:${NAVY};color:#fff;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700">Confirm my email</a></p>
         <p style="color:${MUTED};font-size:13px">If you did not create this account, you can ignore this email.</p>`,
      ),
      text: `Confirm your email address to finish setting up your account: ${link}\n\nIf you did not create this account, ignore this email.`,
    });
    if (result.error) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "email.verify_failed",
          detail: redact(String(result.error.message ?? "unknown")),
        }),
      );
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true, client: true, staff: false };
  } catch (error) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "email.verify_error",
        detail: redact(error instanceof Error ? error.message : "unknown error"),
      }),
    );
    return { ok: false, reason: "send_failed" };
  }
}
