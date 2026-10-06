export const runtime = "edge";

export async function GET() {
  const out: Record<string, unknown> = {
    nodeVersion: typeof process !== "undefined" ? process.version : null,
    hasProcessEnv: typeof process !== "undefined" && !!process.env,
    hasDatabaseUrl: typeof process !== "undefined" && !!process.env.DATABASE_URL,
    databaseUrlStart: typeof process !== "undefined" && process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0, 20) : null,
    hasCloudflareEnv: false,
    cloudflareKeys: null as string[] | null,
    hasEnvDb: false,
  };
  try {
    const mod = await import("cloudflare:workers").catch(() => null);
    out.hasCloudflareEnv = !!mod;
    if (mod) {
      const env: Record<string, unknown> = (mod as { env?: Record<string, unknown> }).env ?? {};
      out.cloudflareKeys = Object.keys(env);
      out.hasEnvDb = !!env.DB;
    }
  } catch (e) {
    out.cloudflareKeys = ["error:" + (e instanceof Error ? e.message : String(e))];
  }
  return Response.json(out);
}
