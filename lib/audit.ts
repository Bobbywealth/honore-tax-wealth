import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

/**
 * Append-only audit log writer.
 *
 * The audit_events table has no update or delete path by design. Every
 * security-relevant mutation (status changes, note creation, assignment
 * changes, MFA changes) should log here so the trail shows WHO did WHAT
 * and WHEN — especially when more than one authorized person works on an
 * account.
 *
 * Never throws: audit logging must not break the request it describes.
 */
export type AuditAction =
  | "note.created"
  | "return.stage_changed"
  | "client.assigned"
  | "client.status_changed"
  | "document.requested"
  | "document.reviewed"
  | "mfa.enabled"
  | "mfa.disabled"
  | "user.registered"
  | "user.deactivated";

export async function audit(
  actor: SessionUser | null,
  action: AuditAction,
  entityType: string,
  entityId: string,
  metadata?: Record<string, string | number | boolean | null>,
  ipHash?: string,
): Promise<void> {
  try {
    await getDb().insert(auditEvents).values({
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
      ipHash: ipHash ?? null,
    });
  } catch (err) {
    // Audit failure is logged but never breaks the request.
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "audit.write_failed",
        action,
        reason: err instanceof Error ? err.message : "unknown",
      }),
    );
  }
}
