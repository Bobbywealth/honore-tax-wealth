import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { clients, engagements, users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Assign / re-assign a client to a specific agent.
 *
 * - Admin-only. Agents cannot assign clients to themselves or each other.
 * - Updates `clients.owner_id` (the durable primary-agent field the
 *   scoped-clientIds helper reads) AND cascades the same owner_id onto
 *   every non-archived engagement for this client so engagement-level
 *   scoping agrees with the client-level field.
 * - Empty ownerId is accepted to UNASSIGN (admin removes the agent and
 *   the client temporarily has no handler). The cascade clears engagements
 *   too.
 * - The target user must exist, must not be the `client` role, and must
 *   not be soft-deleted.
 */
const schema = z.object({
  ownerId: z.string().uuid().nullable(),
  csrf: z.string().optional(),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  // Never log the actor email or the password. Client ids only.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const me = await requireRole("admin");
  if (!me) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let parsed: z.infer<typeof schema>;
  // Accept both native-form submissions and JSON callers. The plain
  // HTML form on the client detail page submits application/x-www-form-urlencoded;
  // any future fetch caller hits the JSON branch.
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const ownerRaw = form.get("ownerId");
      const ownerStr = typeof ownerRaw === "string" ? ownerRaw : "";
      const trimmed = ownerStr.trim();
      parsed = schema.parse({
        ownerId: trimmed === "" ? null : trimmed,
      });
    } else {
      const raw = await request.text();
      parsed = schema.parse(JSON.parse(raw));
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const clientRows = await db
      .select({ id: clients.id, ownerId: clients.ownerId })
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    if (clientRows.length === 0) {
      return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }

    if (parsed.ownerId !== null) {
      // Verify the target user is a non-client, non-deactivated staff/assistant/admin.
      const agentRows = await db
        .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
        .from(users)
        .where(eq(users.id, parsed.ownerId))
        .limit(1);
      const agent = agentRows[0];
      if (!agent) {
        return NextResponse.json({ ok: false, error: "agent_not_found" }, { status: 404 });
      }
      if (agent.role === "client") {
        return NextResponse.json(
          { ok: false, error: "target_is_client", message: "Cannot assign a client role as an agent." },
          { status: 400 },
        );
      }
      if (agent.deactivatedAt) {
        return NextResponse.json(
          { ok: false, error: "agent_deactivated", message: "This account is deactivated and cannot be assigned." },
          { status: 400 },
        );
      }
    }

    const previousOwnerId = clientRows[0].ownerId;

    // Update clients.owner_id.
    await db
      .update(clients)
      .set({ ownerId: parsed.ownerId, updatedAt: new Date() })
      .where(eq(clients.id, id));

    // Cascade: every non-archived engagement's owner_id matches. We
    // overwrite (not just fill empty) so reassigning puts the work in
    // the new agent's queue, not the old one.
    const cascadeResult = await db
      .update(engagements)
      .set({ ownerId: parsed.ownerId, updatedAt: new Date() })
      .where(and(eq(engagements.clientId, id), isNull(engagements.archivedAt)))
      .returning({ id: engagements.id });

    logEvent("client.assigned", {
      actorId: me.id,
      clientId: id,
      fromOwnerId: previousOwnerId,
      toOwnerId: parsed.ownerId,
      engagementCount: cascadeResult.length,
    });

    revalidatePath(`/dashboard/admin/clients/${id}`);
    revalidatePath(`/dashboard/admin/clients`);

    // JSON callers get a structured response. Plain HTML form submissions
    // are bounced back to the client detail page so they see the updated
    // assignment without writing any fetch/JS in the sidebar.
    const wantsJson =
      (request.headers.get("accept") ?? "").includes("application/json") ||
      contentType.includes("application/json");
    if (!wantsJson) {
      const params = new URLSearchParams({ assigned: parsed.ownerId ?? "" });
      return NextResponse.redirect(
        new URL(`/dashboard/admin/clients/${id}?${params.toString()}`, request.url),
        303,
      );
    }

    return NextResponse.json({
      ok: true,
      clientId: id,
      previousOwnerId,
      newOwnerId: parsed.ownerId,
      engagementCount: cascadeResult.length,
    });
  } catch (err) {
    logEvent("client.assign.error", {
      clientId: id,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// Suppress an unused-locals warning when the unused `csrf` field is referenced
// in future proofing. Kept in the schema so a future rotated CSRF token fits
// without re-validating every caller.
void sql;
