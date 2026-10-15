import { getDb } from "@/db";
import { notifications, notificationPreferences, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mailConfigured } from "@/lib/email";

/**
 * Notification dispatcher.
 *
 * Two channels:
 * - "inapp": always works. Shown in the client portal bell. This is the
 *   primary channel until email is configured.
 * - "email": queued via the notifications table; a sender worker (or the
 *   existing Resend integration) delivers when RESEND_API_KEY is set.
 *   Gracefully skipped when mail is not configured — the in-app
 *   notification still lands.
 *
 * Payloads carry only non-sensitive metadata (ids, labels). Never tax
 * content, per the notification_preferences table comment.
 */

export type NotifyTemplate =
  | "document_requested"
  | "status_action_needed"
  | "status_ready_for_signature"
  | "message_received"
  | "appointment_confirmed";

type NotifyInput = {
  userId: string;
  template: NotifyTemplate;
  /** Non-sensitive labels only: e.g. { documentTitle: "W-2" }. */
  payload?: Record<string, string | number | boolean>;
  dedupeKey?: string;
};

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Create an in-app notification and, when configured, queue an email.
 * Never throws.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const db = getDb();

    // In-app notification: always created.
    await db.insert(notifications).values({
      userId: input.userId,
      channel: "inapp",
      template: input.template,
      payload: input.payload ?? {},
      status: "sent",
      sentAt: new Date(),
      dedupeKey: input.dedupeKey ? `inapp:${input.dedupeKey}` : null,
    });

    // Email: only when the user opted in and mail is configured.
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, input.userId))
      .limit(1);
    const emailOk = prefs[0]?.emailEnabled ?? true;
    if (emailOk && mailConfigured()) {
      await db.insert(notifications).values({
        userId: input.userId,
        channel: "email",
        template: input.template,
        payload: input.payload ?? {},
        status: "queued",
        dedupeKey: input.dedupeKey ? `email:${input.dedupeKey}` : null,
      });
    } else if (emailOk && !mailConfigured()) {
      logEvent("notify.email_skipped", {
        template: input.template,
        reason: "not_configured",
      });
    }
  } catch (err) {
    // ON CONFLICT on dedupeKey is expected for retries — not an error.
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("dedupe") && !msg.includes("duplicate")) {
      logEvent("notify.failed", {
        template: input.template,
        reason: msg.slice(0, 120),
      });
    }
  }
}

/**
 * Notify all client-portal users linked to a client record.
 * Used when a document is requested, a status changes, etc.
 */
export async function notifyClientUsers(
  clientId: string,
  template: NotifyTemplate,
  payload?: Record<string, string | number | boolean>,
  dedupeKey?: string,
): Promise<void> {
  try {
    const db = getDb();
    const { clientAccess } = await import("@/db/schema");
    const rows = await db
      .select({ userId: clientAccess.userId })
      .from(clientAccess)
      .where(eq(clientAccess.clientId, clientId));
    await Promise.all(
      rows.map((r) =>
        notify({ userId: r.userId, template, payload, dedupeKey }),
      ),
    );
  } catch (err) {
    logEvent("notify.client_users_failed", {
      template,
      reason: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }
}

/** Human-readable labels for the in-app bell. No PII beyond the label. */
export const TEMPLATE_LABEL: Record<NotifyTemplate, string> = {
  document_requested: "New document request",
  status_action_needed: "Action needed on your return",
  status_ready_for_signature: "Ready for your signature",
  message_received: "New message from your preparer",
  appointment_confirmed: "Appointment confirmed",
};

export function templateBody(
  template: NotifyTemplate,
  payload: Record<string, string | number | boolean>,
): string {
  switch (template) {
    case "document_requested":
      return `Your preparer requested: ${payload.documentTitle ?? "a document"}. Check your Documents page.`;
    case "status_action_needed":
      return "Your return needs your attention. Open your portal to see what's needed.";
    case "status_ready_for_signature":
      return "A document is ready for your signature. Open Forms to review and sign.";
    case "message_received":
      return "You have a new message from your preparer.";
    case "appointment_confirmed":
      return `Your appointment${payload.appointmentTitle ? ` (${payload.appointmentTitle})` : ""} is confirmed.`;
    default:
      return "You have a new notification.";
  }
}
