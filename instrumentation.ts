/**
 * Next.js startup hook. Runs once per server process.
 *
 * Only the Node.js runtime has a database and process signals, so the Edge
 * runtime is skipped entirely.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("./lib/env");
  const { attachShutdown } = await import("./lib/shutdown");

  validateEnv();
  attachShutdown();
}