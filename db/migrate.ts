import { sql } from "drizzle-orm";
import { getDb, getPool } from "./index";

/**
 * Idempotent schema migrations.
 *
 * Every statement is safe to re-run. This runs once per process on first
 * request rather than from a separate migration step, because the free Render
 * instance has no persistent disk and no shell to run one by hand.
 *
 * Advisory lock guards against two instances migrating concurrently during a
 * rolling deploy: the second waits, then finds everything already applied.
 */

const STATEMENTS: string[] = [
  /* ---------------- Advisory lock (serialized, self-releasing) ------- */
  `SELECT pg_advisory_lock(918273645)`,

  /* -------------------------- Existing intake ---------------------- */
  `CREATE TABLE IF NOT EXISTS consultations (
     id BIGSERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     email VARCHAR(180) NOT NULL,
     phone VARCHAR(30) NOT NULL,
     service TEXT NOT NULL,
     message TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  /* ------------- Backfill columns added after first release ---------- */
  // The public form now returns a reference the visitor can quote. Existing
  // rows are backfilled before the NOT NULL constraint is applied.
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reference VARCHAR(24)`,
  `UPDATE consultations SET reference = 'ref_' || substr(md5(random()::text), 1, 12)
     WHERE reference IS NULL`,
  `ALTER TABLE consultations ALTER COLUMN reference SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS consultations_reference_key ON consultations (reference)`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new'`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(32)`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS user_agent VARCHAR(300)`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS consultations_status_idx ON consultations (status)`,

  /* ============================ Identity ============================ */
  `CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(180) NOT NULL,
     password_hash TEXT NOT NULL,
     role VARCHAR(20) NOT NULL DEFAULT 'client',
     display_name VARCHAR(120),
     phone VARCHAR(30),
     email_verified_at TIMESTAMPTZ,
     sessions_valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_login_at TIMESTAMPTZ,
     failed_login_count INTEGER NOT NULL DEFAULT 0,
     locked_until TIMESTAMPTZ,
     deactivated_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email)`,
  `CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)`,
  // Soft-delete watermark added by f91cc07 ("extend roles with assistant +
  // add deactivatedAt soft-delete"). Backfill column on existing
  // deployments and keep a partial index for the team-list filter that
  // excludes deactivated accounts.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS users_deactivated_at_idx
     ON users (deactivated_at) WHERE deactivated_at IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash VARCHAR(64) NOT NULL,
     user_agent VARCHAR(300),
     ip_hash VARCHAR(32),
     expires_at TIMESTAMPTZ NOT NULL,
     revoked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)`,

  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash VARCHAR(64) NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_key ON password_reset_tokens (token_hash)`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id)`,

  `CREATE TABLE IF NOT EXISTS email_verification_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash VARCHAR(64) NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_hash_key ON email_verification_tokens (token_hash)`,

  /* ============================== Leads ============================= */
  `CREATE TABLE IF NOT EXISTS leads (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(100) NOT NULL,
     email VARCHAR(180) NOT NULL,
     phone VARCHAR(30),
     service VARCHAR(120),
     source VARCHAR(60) NOT NULL DEFAULT 'website',
     stage VARCHAR(30) NOT NULL DEFAULT 'new',
     owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
     follow_up_at TIMESTAMPTZ,
     notes TEXT,
     converted_client_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage)`,
  `CREATE INDEX IF NOT EXISTS leads_owner_id_idx ON leads (owner_id)`,
  `CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email)`,

  /* ============================= Clients ============================ */
  `CREATE TABLE IF NOT EXISTS clients (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     display_name VARCHAR(120) NOT NULL,
     legal_name VARCHAR(160),
     email VARCHAR(180),
     phone VARCHAR(30),
     entity_type VARCHAR(40) NOT NULL DEFAULT 'individual',
     tax_id_last4 VARCHAR(4),
     status VARCHAR(20) NOT NULL DEFAULT 'prospect',
     address_line1 VARCHAR(160),
     address_line2 VARCHAR(160),
     city VARCHAR(80),
     state VARCHAR(40),
     postal_code VARCHAR(20),
     timezone VARCHAR(60) NOT NULL DEFAULT 'America/New_York',
     notes TEXT,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS clients_status_idx ON clients (status)`,
  `CREATE INDEX IF NOT EXISTS clients_email_idx ON clients (email)`,
  // Primary agent column for row-level scoping. Backfilled for existing
  // deployments so the scoped-clientIds helper can rely on the column.
  // Partial index keeps the agent-assignment list cheap regardless of
  // practice size.
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS clients_owner_id_idx
     ON clients (owner_id) WHERE owner_id IS NOT NULL`,

  /* Who may see which client. Never authorize by matching email strings. */
  `CREATE TABLE IF NOT EXISTS client_access (
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     granted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (client_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS client_access_user_id_idx ON client_access (user_id)`,

  `CREATE TABLE IF NOT EXISTS inquiry_notes (
     id BIGSERIAL PRIMARY KEY,
     consultation_id BIGINT REFERENCES consultations(id) ON DELETE CASCADE,
     lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
     author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     body TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS inquiry_notes_author_id_idx ON inquiry_notes (author_id)`,

  /* =========================== Engagements ========================== */
  `CREATE TABLE IF NOT EXISTS engagements (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     name VARCHAR(160) NOT NULL,
     service_type VARCHAR(80) NOT NULL,
     status VARCHAR(30) NOT NULL DEFAULT 'intake',
     owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
     progress_percent INTEGER NOT NULL DEFAULT 0,
     internal_notes TEXT,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS engagements_client_id_idx ON engagements (client_id)`,
  `CREATE INDEX IF NOT EXISTS engagements_status_idx ON engagements (status)`,

  `CREATE TABLE IF NOT EXISTS tax_years (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     year INTEGER NOT NULL,
     filing_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
     due_date TIMESTAMPTZ,
     extension_filed_at TIMESTAMPTZ,
     external_confirmation_ref VARCHAR(120),
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tax_years_client_year_key ON tax_years (client_id, year)`,
  `CREATE INDEX IF NOT EXISTS tax_years_due_date_idx ON tax_years (due_date)`,

  `CREATE TABLE IF NOT EXISTS returns (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
     tax_year_id UUID NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
     form_type VARCHAR(40) NOT NULL,
     stage VARCHAR(30) NOT NULL DEFAULT 'not_started',
     assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
     prepared_at TIMESTAMPTZ,
     filed_at TIMESTAMPTZ,
     external_status VARCHAR(40),
     external_ref VARCHAR(120),
     history JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS returns_engagement_id_idx ON returns (engagement_id)`,
  `CREATE INDEX IF NOT EXISTS returns_stage_idx ON returns (stage)`,

  /* ============================ Documents =========================== */
  `CREATE TABLE IF NOT EXISTS documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     tax_year_id UUID REFERENCES tax_years(id) ON DELETE SET NULL,
     storage_key VARCHAR(400) NOT NULL,
     original_filename VARCHAR(255) NOT NULL,
     sanitized_filename VARCHAR(255) NOT NULL,
     content_type VARCHAR(120) NOT NULL,
     size_bytes BIGINT NOT NULL,
     checksum VARCHAR(64),
     category VARCHAR(40) NOT NULL DEFAULT 'other',
     review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
     scan_status VARCHAR(20) NOT NULL DEFAULT 'pending',
     version INTEGER NOT NULL DEFAULT 1,
     supersedes_id UUID,
     uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     retention_until TIMESTAMPTZ,
     deleted_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS documents_storage_key_key ON documents (storage_key)`,
  `CREATE INDEX IF NOT EXISTS documents_client_id_idx ON documents (client_id)`,
  `CREATE INDEX IF NOT EXISTS documents_tax_year_id_idx ON documents (tax_year_id)`,
  `CREATE INDEX IF NOT EXISTS documents_review_status_idx ON documents (review_status)`,

  `CREATE TABLE IF NOT EXISTS document_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     tax_year_id UUID REFERENCES tax_years(id) ON DELETE SET NULL,
     title VARCHAR(200) NOT NULL,
     description TEXT,
     required BOOLEAN NOT NULL DEFAULT TRUE,
     due_at TIMESTAMPTZ,
     fulfilled_at TIMESTAMPTZ,
     created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS document_requests_client_id_idx ON document_requests (client_id)`,
  `CREATE INDEX IF NOT EXISTS document_requests_fulfilled_at_idx ON document_requests (fulfilled_at)`,

  /* ============================== Tasks ============================= */
  `CREATE TABLE IF NOT EXISTS tasks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title VARCHAR(240) NOT NULL,
     description TEXT,
     status VARCHAR(20) NOT NULL DEFAULT 'open',
     priority VARCHAR(12) NOT NULL DEFAULT 'normal',
     client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
     engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
     assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
     created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     due_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS tasks_assigned_to_id_idx ON tasks (assigned_to_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status)`,
  `CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON tasks (due_at)`,

  /* =========================== Scheduling =========================== */
  `CREATE TABLE IF NOT EXISTS appointments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     title VARCHAR(160) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'requested',
     starts_at TIMESTAMPTZ NOT NULL,
     ends_at TIMESTAMPTZ NOT NULL,
     timezone VARCHAR(60) NOT NULL DEFAULT 'America/New_York',
     staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
     location VARCHAR(160),
     notes TEXT,
     cancelled_at TIMESTAMPTZ,
     cancellation_reason VARCHAR(240),
     reminder_sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS appointments_staff_starts_idx ON appointments (staff_id, starts_at)`,
  `CREATE INDEX IF NOT EXISTS appointments_client_starts_idx ON appointments (client_id, starts_at)`,
  `CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status)`,

  `CREATE TABLE IF NOT EXISTS availability_rules (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
     weekday INTEGER NOT NULL,
     start_minute INTEGER NOT NULL,
     end_minute INTEGER NOT NULL,
     slot_minutes INTEGER NOT NULL DEFAULT 30,
     buffer_minutes INTEGER NOT NULL DEFAULT 10,
     timezone VARCHAR(60) NOT NULL DEFAULT 'America/New_York',
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS availability_rules_staff_id_idx ON availability_rules (staff_id)`,

  `CREATE TABLE IF NOT EXISTS appointment_blocks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
     starts_at TIMESTAMPTZ NOT NULL,
     ends_at TIMESTAMPTZ NOT NULL,
     reason VARCHAR(160),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS appointment_blocks_staff_starts_idx ON appointment_blocks (staff_id, starts_at)`,

  /* ============================ Messaging =========================== */
  `CREATE TABLE IF NOT EXISTS conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     subject VARCHAR(200) NOT NULL,
     last_message_at TIMESTAMPTZ,
     client_unread_count INTEGER NOT NULL DEFAULT 0,
     staff_unread_count INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS conversations_client_id_idx ON conversations (client_id)`,
  `CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON conversations (last_message_at)`,

  `CREATE TABLE IF NOT EXISTS messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     body TEXT NOT NULL,
     read_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id)`,

  /* ========================= Notifications ========================== */
  `CREATE TABLE IF NOT EXISTS notification_preferences (
     user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
     sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
     sms_phone VARCHAR(30),
     notify_on_new_lead BOOLEAN NOT NULL DEFAULT TRUE,
     notify_on_message BOOLEAN NOT NULL DEFAULT TRUE,
     notify_on_task_due BOOLEAN NOT NULL DEFAULT TRUE,
     notify_on_appointment BOOLEAN NOT NULL DEFAULT TRUE,
     quiet_hours_start VARCHAR(5),
     quiet_hours_end VARCHAR(5),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  /* Delivery log. dedupe_key makes redelivery idempotent. */
  `CREATE TABLE IF NOT EXISTS notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     channel VARCHAR(20) NOT NULL,
     template VARCHAR(60) NOT NULL,
     payload JSONB,
     status VARCHAR(20) NOT NULL DEFAULT 'queued',
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     provider_message_id VARCHAR(160),
     dedupe_key VARCHAR(160),
     next_attempt_at TIMESTAMPTZ,
     sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id)`,
  `CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_key
     ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL`,

  /* ============================= Billing ============================ */
  `CREATE TABLE IF NOT EXISTS invoices (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
     number VARCHAR(40) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     currency VARCHAR(3) NOT NULL DEFAULT 'USD',
     subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
     tax NUMERIC(12,2) NOT NULL DEFAULT 0,
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     due_at TIMESTAMPTZ,
     payment_provider VARCHAR(40),
     payment_reference VARCHAR(160),
     paid_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_key ON invoices (number)`,
  `CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON invoices (client_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status)`,

  /* ======================= Compliance and audit ===================== */
  `CREATE TABLE IF NOT EXISTS consents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
     client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
     kind VARCHAR(60) NOT NULL,
     granted BOOLEAN NOT NULL,
     policy_version VARCHAR(20) NOT NULL,
     ip_hash VARCHAR(32),
     granted_at TIMESTAMPTZ,
     revoked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS consents_subject_user_id_idx ON consents (subject_user_id)`,
  `CREATE INDEX IF NOT EXISTS consents_client_id_idx ON consents (client_id)`,

  /* Append-only trail for privileged and sensitive actions. */
  `CREATE TABLE IF NOT EXISTS audit_events (
     id BIGSERIAL PRIMARY KEY,
     actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
     actor_role VARCHAR(20),
     action VARCHAR(80) NOT NULL,
     entity_type VARCHAR(60),
     entity_id VARCHAR(64),
     metadata JSONB,
     ip_hash VARCHAR(32),
     request_id VARCHAR(40),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS audit_events_actor_id_idx ON audit_events (actor_id)`,
  `CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at)`,

  /* ====================== Infrastructure tables ===================== */
  /* Shared across instances. An in-memory limiter resets on every cold
     start, which on a free plan happens constantly. */
  `CREATE TABLE IF NOT EXISTS rate_limit_counters (
     key VARCHAR(160) PRIMARY KEY,
     count INTEGER NOT NULL DEFAULT 0,
     window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx ON rate_limit_counters (window_start)`,

  /* Canned staff responses for the inbox quick-pick chips. */
  `CREATE TABLE IF NOT EXISTS canned_responses (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title VARCHAR(80) NOT NULL,
     body TEXT NOT NULL,
     shortcut VARCHAR(12),
     sort_order INTEGER NOT NULL DEFAULT 100,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS canned_responses_active_idx ON canned_responses (active, sort_order)`,

  /* In-app signing: signable documents + signatures (replaces the
   * DocuSign send-out for the practice's most common 1040, engagement
   * letter, and consent workflows). ESIGN Act compliant: consent text
   * + IP + UA + timestamp captured per signature. */
  `CREATE TABLE IF NOT EXISTS signable_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     prepared_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     kind VARCHAR(40) NOT NULL DEFAULT 'custom',
     title VARCHAR(200) NOT NULL,
     body TEXT NOT NULL,
     form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
     required_signers INTEGER NOT NULL DEFAULT 1,
     status VARCHAR(20) NOT NULL DEFAULT 'pending',
     tax_year INTEGER,
     due_at TIMESTAMPTZ,
     expires_at TIMESTAMPTZ,
     cancelled_at TIMESTAMPTZ,
     cancelled_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
     signed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS signable_documents_client_idx ON signable_documents (client_id)`,
  `CREATE INDEX IF NOT EXISTS signable_documents_status_idx ON signable_documents (status)`,
  `CREATE INDEX IF NOT EXISTS signable_documents_kind_idx ON signable_documents (kind)`,

  `CREATE TABLE IF NOT EXISTS signatures (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     document_id UUID NOT NULL REFERENCES signable_documents(id) ON DELETE CASCADE,
     signer_id UUID REFERENCES users(id) ON DELETE SET NULL,
     signer_name VARCHAR(160) NOT NULL,
     signer_email VARCHAR(180),
     signer_role VARCHAR(60),
     signature_type VARCHAR(20) NOT NULL,
     signature_data TEXT NOT NULL,
     consent_text TEXT NOT NULL,
     ip_address VARCHAR(64),
     user_agent VARCHAR(300),
     signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     revoked_at TIMESTAMPTZ,
     revoked_reason TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS signatures_document_idx ON signatures (document_id)`,
  `CREATE INDEX IF NOT EXISTS signatures_signer_idx ON signatures (signer_id)`,

  /* Makes a retried submission or payment a no-op instead of a duplicate. */
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
     key VARCHAR(160) PRIMARY KEY,
     scope VARCHAR(60) NOT NULL,
     response_status INTEGER,
     response_body JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys (expires_at)`,

  `CREATE TABLE IF NOT EXISTS email_templates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     key VARCHAR(80) NOT NULL UNIQUE,
     name VARCHAR(160) NOT NULL,
     subject VARCHAR(240) NOT NULL,
     body TEXT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS email_templates_key_idx ON email_templates (key)`,

  `CREATE TABLE IF NOT EXISTS intake_form_fields (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     field_key VARCHAR(80) NOT NULL UNIQUE,
     label VARCHAR(160) NOT NULL,
     field_type VARCHAR(20) NOT NULL DEFAULT 'text',
     required BOOLEAN NOT NULL DEFAULT FALSE,
     sort_order INTEGER NOT NULL DEFAULT 0,
     options JSONB,
     is_custom BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS intake_form_fields_key_idx ON intake_form_fields (field_key)`,
  `CREATE INDEX IF NOT EXISTS intake_form_fields_order_idx ON intake_form_fields (sort_order)`,

  /* Internal agent/admin notes. Never exposed to clients. */
  `CREATE TABLE IF NOT EXISTS internal_notes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     author_id UUID REFERENCES users(id) ON DELETE SET NULL,
     author_name VARCHAR(120),
     author_role VARCHAR(20),
     body TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS internal_notes_client_id_idx ON internal_notes (client_id)`,
  `CREATE INDEX IF NOT EXISTS internal_notes_created_at_idx ON internal_notes (created_at)`,

  /* MFA columns on users. Idempotent: ADD COLUMN IF NOT EXISTS. */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ`,

  /* App settings key/value table. */
  `CREATE TABLE IF NOT EXISTS app_settings (
     key VARCHAR(120) PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  /* Release the advisory lock on every path, including failure. */
  `SELECT pg_advisory_unlock(918273645)`,
];

let ran = false;

export async function ensureMigrated(): Promise<void> {
  if (ran) return;
  const db = getDb();
  for (const stmt of STATEMENTS) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "db.migration_failed",
          statement: stmt.slice(0, 90),
          reason: err instanceof Error ? err.message : "unknown",
        }),
      );
      throw err;
    }
  }
  ran = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "db.migrations_ensured" }));
}

export async function close(): Promise<void> {
  await getPool().end();
}



import { cannedResponses } from "@/db/schema";

const SEED: Array<{ title: string; body: string; shortcut: string; sortOrder: number }> = [
  {
    title: "Received — review",
    shortcut: "rcv",
    sortOrder: 10,
    body:
      "Thanks for reaching out — I have this and will take a look. You don't need to do anything else right now; I'll message back as soon as I have an update.",
  },
  {
    title: "Need a document",
    shortcut: "doc",
    sortOrder: 20,
    body:
      "Could you send me the document we talked about? You can reply here and I'll see it. If it's sensitive, mention that and we'll set up a secure upload link.",
  },
  {
    title: "Schedule a call",
    shortcut: "cal",
    sortOrder: 30,
    body:
      "Happy to walk through this on a quick call. Any time between 9 and 4 Eastern works for me — let me know a window that suits you and I'll confirm a slot.",
  },
  {
    title: "Closing the loop",
    shortcut: "cls",
    sortOrder: 40,
    body:
      "All set on our end — thanks again for the update. Ping me whenever anything else comes up.",
  },
  {
    title: "Out of office (1 day)",
    shortcut: "ooo",
    sortOrder: 50,
    body:
      "I'm out of the office today and back tomorrow morning. For anything urgent, please reach out to the office line and the team will pick it up.",
  },
  {
    title: "Payment question",
    shortcut: "pay",
    sortOrder: 60,
    body:
      "Thanks for the note — the invoice is on its way. ACH is our preferred method; let me know if you need the routing details or a card-payment link and I'll send it over.",
  },
];

export async function seedCannedResponsesIfEmpty(): Promise<void> {
  try {
    await ensureMigrated();
    const db = getDb();
    const existing = await db.select({ id: cannedResponses.id }).from(cannedResponses).limit(1);
    if (existing.length > 0) return;
    await db.insert(cannedResponses).values(SEED);
  } catch {
    // best-effort; do not block page renders
  }
}

import { emailTemplates, intakeFormFields } from "@/db/schema";

const EMAIL_TEMPLATE_SEED: Array<{ key: string; name: string; subject: string; body: string }> = [
  {
    key: "consultation_request",
    name: "New consultation request notification",
    subject: "New consultation request — {{name}}",
    body: "A new consultation request was submitted.\n\nName: {{name}}\nEmail: {{email}}\nPhone: {{phone}}\nService: {{service}}\n\nNotes:\n{{notes}}",
  },
  {
    key: "appointment_confirmation",
    name: "Appointment confirmation",
    subject: "Your appointment is confirmed — {{date}}",
    body: "Hi {{name}},\n\nYour appointment on {{date}} at {{time}} is confirmed.\n\nMeeting type: {{meetingType}}\n\nReply to this email if you need to reschedule.",
  },
  {
    key: "document_request",
    name: "Document request",
    subject: "Documents needed for your tax return",
    body: "Hi {{name}},\n\nTo keep your return moving, please upload the following:\n\n{{documents}}\n\nYou can mark each item as uploaded from your client portal.",
  },
  {
    key: "form_ready_to_sign",
    name: "Form ready to sign",
    subject: "A document is ready for your signature",
    body: "Hi {{name}},\n\n{{formTitle}} is ready for your review and signature.\n\nSign in to your client portal to review and sign.",
  },
  {
    key: "invoice_sent",
    name: "Invoice sent",
    subject: "Invoice {{invoiceNumber}} from Honore Tax & Wealth",
    body: "Hi {{name}},\n\nInvoice {{invoiceNumber}} for {{amount}} is ready.\n\nDue date: {{dueDate}}\n\nYou can view it in your client portal.",
  },
];

export async function seedEmailTemplatesIfEmpty(): Promise<void> {
  try {
    await ensureMigrated();
    const db = getDb();
    const existing = await db.select({ id: emailTemplates.id }).from(emailTemplates).limit(1);
    if (existing.length > 0) return;
    await db.insert(emailTemplates).values(EMAIL_TEMPLATE_SEED);
  } catch {
    // best-effort; do not block page renders
  }
}

const INTAKE_FIELD_SEED: Array<{
  fieldKey: string; label: string; fieldType: string; required: boolean; sortOrder: number; isCustom: boolean;
}> = [
  { fieldKey: "name", label: "Full name", fieldType: "text", required: true, sortOrder: 10, isCustom: false },
  { fieldKey: "email", label: "Email address", fieldType: "email", required: true, sortOrder: 20, isCustom: false },
  { fieldKey: "phone", label: "Phone number", fieldType: "tel", required: true, sortOrder: 30, isCustom: false },
  { fieldKey: "service", label: "Service needed", fieldType: "select", required: true, sortOrder: 40, isCustom: false },
  { fieldKey: "notes", label: "Notes", fieldType: "textarea", required: false, sortOrder: 50, isCustom: false },
];

export async function seedIntakeFieldsIfEmpty(): Promise<void> {
  try {
    await ensureMigrated();
    const db = getDb();
    const existing = await db.select({ id: intakeFormFields.id }).from(intakeFormFields).limit(1);
    if (existing.length > 0) return;
    await db.insert(intakeFormFields).values(INTAKE_FIELD_SEED);
  } catch {
    // best-effort; do not block page renders
  }
}
