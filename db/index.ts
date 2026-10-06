import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __honorePgPool: pg.Pool | undefined;
}

function pool(): pg.Pool {
  if (globalThis.__honorePgPool) return globalThis.__honorePgPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const p = new pg.Pool({
    connectionString: url,
    ssl: url.includes("render.com") ? { rejectUnauthorized: false } : false,
    max: 5,
  });
  p.on("error", (err) => console.error("[pg] idle client error", err));
  globalThis.__honorePgPool = p;
  return p;
}

let cached: Database | undefined;

/**
 * Lazily construct the Drizzle client.
 *
 * This must not run at module scope. `next build` imports page modules while
 * collecting page data, so an eagerly-created client required DATABASE_URL on
 * the build machine and failed the production build with
 * "Failed to collect configuration for /dashboard/admin ... DATABASE_URL is not
 * set". A build must never need a live database.
 */
export function getDb(): Database {
  if (!cached) cached = drizzle(pool(), { schema });
  return cached;
}

/** Lazily construct the shared connection pool. See getDb() for why. */
export function getPool(): pg.Pool {
  return pool();
}