import { getPool } from "@/db";

/**
 * Graceful shutdown for the Postgres connection pool.
 *
 * Render sends SIGTERM before replacing an instance and when a free instance
 * spins down. Without an explicit close, in-flight requests can be dropped
 * while a query is still running and the pool keeps the event loop alive.
 *
 * The handler closes the pool but does NOT call process.exit(): Next.js owns
 * the HTTP shutdown and drains in-flight requests itself. Forcing an exit here
 * would truncate exactly those requests.
 */

let attached = false;

export function attachShutdown(): void {
  if (attached) return;
  attached = true;

  const close = async (signal: string) => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "app.shutdown", signal }));
    try {
      await getPool().end();
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: "app.shutdown.done" }));
    } catch (err) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "app.shutdown.error",
          reason: err instanceof Error ? err.name : "unknown",
        }),
      );
    }
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void close(signal);
    });
  }
}