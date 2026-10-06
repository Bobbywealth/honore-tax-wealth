import { sql } from "drizzle-orm";
import { getDb, getPool } from "./index";

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS consultations (
     id BIGSERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     email VARCHAR(180) NOT NULL,
     phone VARCHAR(30) NOT NULL,
     service TEXT NOT NULL,
     message TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS consultations_email_idx ON consultations (email)`,
  `CREATE INDEX IF NOT EXISTS consultations_created_at_idx ON consultations (created_at)`,
];

let ran = false;

export async function ensureMigrated(): Promise<void> {
  if (ran) return;
  for (const stmt of STATEMENTS) await getDb().execute(sql.raw(stmt));
  ran = true;
  console.log("[db] migrations ensured");
}

export async function close(): Promise<void> {
  await getPool().end();
}