import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Postgres-backed rate limiting, shared across instances.
 *
 * The previous implementation was a process-local Map. On a free Render
 * instance that spins down after 15 idle minutes, every limit silently reset
 * on each cold start, and with more than one instance each had its own count.
 * A brute-force attacker could simply wait for a restart.
 *
 * This does a single atomic upsert, so concurrent requests from the same key
 * cannot race past the limit.
 */

export type RateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consume one unit of quota for `key`.
 *
 * The window resets automatically once it has elapsed, so callers do not need
 * to schedule cleanup. Stale rows are swept opportunistically below.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateResult> {
  const db = getDb();
  const window = `${Math.max(1, Math.floor(windowSeconds))} seconds`;

  const rows = await db.execute(sql`
    INSERT INTO rate_limit_counters (key, count, window_start, updated_at)
    VALUES (${key}, 1, now(), now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_counters.window_start < now() - ${window}::interval THEN 1
        ELSE rate_limit_counters.count + 1
      END,
      window_start = CASE
        WHEN rate_limit_counters.window_start < now() - ${window}::interval THEN now()
        ELSE rate_limit_counters.window_start
      END,
      updated_at = now()
    RETURNING count, window_start
  `);

  const row = (rows as unknown as Array<{ count: number; window_start: Date }>)[0];
  const count = Number(row?.count ?? 1);
  const windowStart = new Date(row?.window_start ?? Date.now());

  if (count > limit) {
    const elapsed = (Date.now() - windowStart.getTime()) / 1000;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
    };
  }

  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/** Check a quota without consuming it. */
export async function peekRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateResult> {
  const rows = await getDb().execute(sql`
    SELECT count, window_start FROM rate_limit_counters WHERE key = ${key}
  `);
  const row = (rows as unknown as Array<{ count: number; window_start: Date }>)[0];
  if (!row) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };

  const windowStart = new Date(row.window_start);
  const elapsed = (Date.now() - windowStart.getTime()) / 1000;
  if (elapsed > windowSeconds) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };

  const count = Number(row.count);
  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
    };
  }
  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/** Drop counters whose window has long since elapsed. Cheap and bounded. */
export async function sweepRateLimits(): Promise<number> {
  try {
    const res = await getDb().execute(sql`
      DELETE FROM rate_limit_counters WHERE window_start < now() - interval '24 hours'
    `);
    return Array.isArray(res) ? res.length : 0;
  } catch {
    // Housekeeping only; never fail a request over it.
    return 0;
  }
}

export function saltedIpKey(scope: string, ipHash: string): string {
  return `${scope}:${ipHash}`;
}