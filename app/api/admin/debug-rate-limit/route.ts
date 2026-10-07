import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireRole } from "@/lib/auth";
import { ensureMigrated } from "@/db/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Temporary route to verify rate limiter is hitting the live Postgres. */
export async function GET(request: Request) {
  const user = await requireRole("admin", "staff");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    await ensureMigrated();
    const db = getDb();
    // Run an isolated trial.
    const key = `debug:${Date.now()}:${user.id.slice(0, 8)}`;
    const trial = await consumeRateLimit(key, 3, 60);
    const trial2 = await consumeRateLimit(key, 3, 60);
    const trial3 = await consumeRateLimit(key, 3, 60);
    const trial4 = await consumeRateLimit(key, 3, 60);

    // Read the rate_limit_counters table directly.
    const rows = await db.execute(sql`SELECT key, count, window_start, updated_at FROM rate_limit_counters ORDER BY updated_at DESC LIMIT 20`);

    return Response.json({
      ok: true,
      trials: [trial, trial2, trial3, trial4],
      counters: rows,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
