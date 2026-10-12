import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureMigrated } from "@/db/migrate";
import { conversations, consultations, messages } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot QA cleanup endpoint.
 *
 * Removes two categories of test data:
 *   1. Consultation rows whose name/email/message contain environment-variable
 *      placeholder strings (LOG_SALT, CONSULTATION_NOTIFY_EMAIL, RESEND_API_KEY,
 *      etc.) that early smoke tests accidentally submitted.
 *   2. Conversations that share the same subject across more than 3 rows on
 *      the same day (the "duplicate 1099" test threads).
 *
 * Gated by the QA_CLEANUP_KEY env var. After the run, remove this file
 * and the env var so it cannot be invoked again.
 */
export async function POST(request: Request) {
  const expected = process.env.QA_CLEANUP_KEY;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "QA_CLEANUP_KEY not set on server" }, { status: 503 });
  }
  const supplied = request.headers.get("x-qa-cleanup-key") ?? new URL(request.url).searchParams.get("key") ?? "";
  if (supplied !== expected) {
    return NextResponse.json({ ok: false, error: "Missing or wrong key" }, { status: 401 });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 503 });
    }
    await ensureMigrated();
    const db = getDb();

    const envHints = ["LOG_SALT", "CONSULTATION_NOTIFY_EMAIL", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "SENDGRID_API_KEY", "TWILIO_ACCOUNT_SID", "ADMIN_PASSWORD", "ADMIN_EMAIL", "CLIENT_EMAIL", "CLIENT_PASSWORD"];

    // 1) Consultations with placeholder names/emails/messages
    const placeholderDeleted = await db.execute(sql`
      DELETE FROM consultations
      WHERE name = ANY (ARRAY[${sql.raw(envHints.map((s) => `'${s}'`).join(",") || "''")}])
         OR email = ANY (ARRAY[${sql.raw(envHints.map((s) => `'${s}'`).join(",") || "''")}])
         OR message ~* 'LOG_SALT|CONSULTATION_NOTIFY_EMAIL|RESEND_API_KEY|ADMIN_PASSWORD|CLIENT_EMAIL'
    `).then((r: unknown) => (r as { rowCount?: number }).rowCount ?? 0);

    // 2) Duplicate conversation threads (same subject across >3 rows on the
    // same day). Only deletes the duplicates, keeps the earliest.
    const dups = await db.execute(sql`
      WITH counted AS (
        SELECT id, subject, created_at::date AS d,
               row_number() OVER (PARTITION BY subject, created_at::date ORDER BY created_at) AS rn
        FROM conversations
      )
      DELETE FROM conversations WHERE id IN (SELECT id FROM counted WHERE rn > 1)
    `).then((r: unknown) => (r as { rowCount?: number }).rowCount ?? 0);

    return NextResponse.json({
      ok: true,
      deleted: {
        placeholderConsultations: placeholderDeleted,
        duplicateConversations: dups,
      },
      hint: "Remove app/api/admin/qa-cleanup and unset QA_CLEANUP_KEY after this run.",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
