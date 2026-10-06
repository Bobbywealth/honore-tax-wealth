import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { inspectEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and dependency check.
 *
 * Returns 200 when the app can serve traffic and 503 when the database is
 * unreachable, so Render's health check can act on real state rather than on
 * "the process is up".
 *
 * Deliberately reveals nothing beyond a coarse status: no hostnames, no
 * connection strings, no driver error text.
 */
export async function GET() {
  const startedAt = Date.now();
  const env = inspectEnv();

  let database: "ok" | "unconfigured" | "unreachable" = "unconfigured";

  if (env.ok) {
    try {
      await getDb().execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  const healthy = database !== "unreachable";

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      latencyMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}