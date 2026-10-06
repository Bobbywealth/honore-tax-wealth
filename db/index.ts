import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

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

export const db = drizzle(pool(), { schema });
export const pgPool = pool();
