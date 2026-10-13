import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __honorePgPool: pg.Pool | undefined;
}

function sslConfig(url: string): pg.PoolConfig["ssl"] {
  // Verified TLS for every non-local database connection.
  //
  // Previously this was `rejectUnauthorized: false` for Render hosts (and
  // plaintext `false` for everything else), which encrypts without
  // authenticating the server — a MITM on the app→DB path could present any
  // certificate and intercept queries. Render Postgres terminates TLS with a
  // publicly-chained certificate, so Node's default CA store verifies it
  // with no extra configuration.
  //
  // Deploy-time overrides:
  // - DB_SSL_CA: PEM of the provider's CA to pin (use if the provider ever
  //   moves to a private CA that is not in Node's default store).
  // - DB_SSL_VERIFY=false: disables verification entirely (MITM-vulnerable).
  //   Logs a loud warning; only a stopgap while a proper CA is provisioned.
  const ca = process.env.DB_SSL_CA?.trim();
  if (ca) return { rejectUnauthorized: true, ca };
  if ((process.env.DB_SSL_VERIFY ?? "true").toLowerCase() === "false") {
    console.warn(
      "[pg] WARNING: DB_SSL_VERIFY=false — database TLS certificate verification is DISABLED. Connections are vulnerable to man-in-the-middle attacks.",
    );
    return { rejectUnauthorized: false };
  }
  if (/^postgres(ql)?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/?#]|$)/i.test(url)) {
    return false; // Local dev over loopback: plaintext, same as before.
  }
  return { rejectUnauthorized: true };
}

function pool(): pg.Pool {
  if (globalThis.__honorePgPool) return globalThis.__honorePgPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const p = new pg.Pool({
    connectionString: url,
    ssl: sslConfig(url),
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