import { and, eq, isNull, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, engagements } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";

/**
 * A non-admin user is the row-level scoping sentinel for every admin-side
 * page that lists or counts clients. Returned by `scopedClientIdsFor(user)`
 * so callers can `inArray(table.clientId, scoped)` without each page
 * rewriting the same join.
 *
 * A client is visible to a non-admin if EITHER:
 *   - clients.owner_id = user.id (direct assignment), OR
 *   - any non-archived engagement has owner_id = user.id
 *
 * Admin users get `null`, meaning "no filter — return everything".
 * Returning null (and not the empty array) avoids an IN () clause with
 * zero values when the sentinel is used directly in a WHERE.
 */
export type ScopedClientIds = string[] | null;

export async function scopedClientIdsFor(user: {
  id: string;
  role: string | null | undefined;
}): Promise<ScopedClientIds> {
  if (user.role === "admin") return null;
  // Defensive: a freshly logged-in user with an unrecognised role still
  // gets the empty set — never the full practice.
  await ensureMigrated();
  const db = getDb();

  const direct = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.ownerId, user.id));

  const viaEngagement = await db
    .selectDistinct({ id: engagements.clientId })
    .from(engagements)
    .where(and(eq(engagements.ownerId, user.id), isNull(engagements.archivedAt)));

  const all = new Set<string>();
  for (const r of direct) all.add(r.id);
  for (const r of viaEngagement) if (r.id) all.add(r.id);
  return Array.from(all);
}

/**
 * Helper for query writers: turn the sentinel into a WHERE clause fragment.
 * Returns undefined (no filter) for admin or an `inArray(col, [])` for
 * non-admins with zero matches — which Drizzle compiles to a SELECT with
 * an unreachable WHERE, the safe behaviour for a user who should see
 * nothing yet.
 */
export function clientIdsWhere(
  scoped: ScopedClientIds,
  column: typeof clients.id | typeof engagements.clientId,
) {
  if (scoped === null) return undefined;
  return inArray(column, scoped);
}

/**
 * A "no clients yet" guard for a non-admin. Useful for rendering an empty
 * state without exposing "no rows" vs "you have nothing".
 */
export function hasAnyClientAccess(scoped: ScopedClientIds): boolean {
  return scoped === null || scoped.length > 0;
}

// re-export so the few callers that need raw `or(...)` access can do so
// without importing drizzle directly on every page.
export { and, eq, isNull, or, sql };
