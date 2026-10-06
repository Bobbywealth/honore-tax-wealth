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
  `CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(180) NOT NULL,
     password_hash TEXT NOT NULL,
     role VARCHAR(20) NOT NULL DEFAULT 'client',
     display_name VARCHAR(120),
     email_verified_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // Emails are stored lowercased by the application, so this plain unique
  // index is sufficient for case-insensitive login lookups.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash VARCHAR(64) NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)`,
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