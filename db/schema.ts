import {
  pgTable,
  bigserial,
  bigint,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 * Shared conventions
 *
 * - Status and role columns are varchar with a TypeScript union rather
 *   than a Postgres ENUM. Adding a value is then a code change, not an
 *   ALTER TYPE that can fail halfway through a migration.
 * - Every table has created_at / updated_at and, where the record is
 *   mutable business state, a soft-delete or archived_at rather than a
 *   hard DELETE, so history and audit trails survive.
 * - Money is stored as numeric(12,2). Never a float.
 * ------------------------------------------------------------------ */

const now = sql`now()`;

/* ============================ Identity ============================ */

export type Role = "client" | "staff" | "assistant" | "admin";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 180 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("client"),
    displayName: varchar("display_name", { length: 120 }),
    phone: varchar("phone", { length: 30 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Forced logout on next request when set; used on password change.
    sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true })
      .notNull()
      .default(now),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    // TOTP MFA. Secret is stored encrypted (see lib/mfa.ts); null when MFA
    // is not set up. Backup codes are single-use, hashed with SHA-256.
    totpSecret: text("totp_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaBackupCodes: jsonb("mfa_backup_codes").$type<string[]>(),
    mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_key").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the bearer token. The raw token is never stored, so a
    // database leak cannot be replayed as a live session.
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 300 }),
    ipHash: varchar("ip_hash", { length: 32 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    tokenUnique: uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    userIdx: index("sessions_user_id_idx").on(t.userId),
    expiresIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    tokenUnique: uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash),
    userIdx: index("password_reset_tokens_user_id_idx").on(t.userId),
  }),
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    tokenUnique: uniqueIndex("email_verification_tokens_hash_key").on(t.tokenHash),
  }),
);

/* ============================== Leads ============================= */

export type LeadStage =
  | "new"
  | "contacted"
  | "consultation_scheduled"
  | "proposal_sent"
  | "won"
  | "lost";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    service: varchar("service", { length: 120 }),
    source: varchar("source", { length: 60 }).notNull().default("website"),
    stage: varchar("stage", { length: 30 }).notNull().default("new"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    notes: text("notes"),
    convertedClientId: uuid("converted_client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    stageIdx: index("leads_stage_idx").on(t.stage),
    ownerIdx: index("leads_owner_id_idx").on(t.ownerId),
    emailIdx: index("leads_email_idx").on(t.email),
  }),
);

/* Public form submissions. Separate from leads so the intake record keeps
 * its own retention and its original unedited payload. */
export const consultations = pgTable(
  "consultations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // Public random reference so a visitor can quote their own submission.
    reference: varchar("reference", { length: 24 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    service: varchar("service", { length: 120 }).notNull(),
    message: text("message").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("new"),
    ipHash: varchar("ip_hash", { length: 32 }),
    userAgent: varchar("user_agent", { length: 300 }),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    // Distinguishes a request for a consultation from a booked appointment.
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(now),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    emailIdx: index("consultations_email_idx").on(t.email),
    createdAtIdx: index("consultations_created_at_idx").on(t.createdAt),
    statusIdx: index("consultations_status_idx").on(t.status),
    referenceUnique: uniqueIndex("consultations_reference_key").on(t.reference),
  }),
);

export type InquiryStatus = "new" | "in_progress" | "waiting_on_client" | "closed";

export const inquiryNotes = pgTable(
  "inquiry_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    consultationId: bigint("consultation_id", { mode: "number" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    authorIdx: index("inquiry_notes_author_id_idx").on(t.authorId),
  }),
);

/* ============================= Clients ============================ */

export type ClientStatus = "prospect" | "active" | "inactive" | "archived";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    legalName: varchar("legal_name", { length: 160 }),
    email: varchar("email", { length: 180 }),
    phone: varchar("phone", { length: 30 }),
    entityType: varchar("entity_type", { length: 40 }).notNull().default("individual"),
    taxIdLast4: varchar("tax_id_last4", { length: 4 }),
    status: varchar("status", { length: 20 }).notNull().default("prospect"),
    addressLine1: varchar("address_line1", { length: 160 }),
    addressLine2: varchar("address_line2", { length: 160 }),
    city: varchar("city", { length: 80 }),
    state: varchar("state", { length: 40 }),
    postalCode: varchar("postal_code", { length: 20 }),
    timezone: varchar("timezone", { length: 60 }).notNull().default("America/New_York"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Primary agent. Row-level scoping lets non-admin staff and assistants
    // see only the clients they're explicitly assigned to. An engagement's
    // owner_id is a parallel assignment — a client is visible to an agent
    // if EITHER the client.owner_id OR any non-archived engagement's
    // owner_id is the agent.
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    statusIdx: index("clients_status_idx").on(t.status),
    emailIdx: index("clients_email_idx").on(t.email),
  }),
);

/* Which login accounts may see which client record. A client may have more
 * than one authorized user (spouse, bookkeeper). Never authorize by email. */
export const clientAccess = pgTable(
  "client_access",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clientId, t.userId] }),
    userIdx: index("client_access_user_id_idx").on(t.userId),
  }),
);

/* =========================== Engagements ========================== */

export type EngagementStatus =
  | "intake"
  | "in_preparation"
  | "client_review"
  | "ready_to_file"
  | "filed"
  | "complete"
  | "on_hold";

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    serviceType: varchar("service_type", { length: 80 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("intake"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    // Staff-set progress. Never implied to be an external filing status.
    progressPercent: integer("progress_percent").notNull().default(0),
    internalNotes: text("internal_notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("engagements_client_id_idx").on(t.clientId),
    statusIdx: index("engagements_status_idx").on(t.status),
  }),
);

export const taxYears = pgTable(
  "tax_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    filingStatus: varchar("filing_status", { length: 30 }).notNull().default("not_started"),
    // Dates the practice asserts. Distinct from any external confirmation.
    dueDate: timestamp("due_date", { withTimezone: true }),
    extensionFiledAt: timestamp("extension_filed_at", { withTimezone: true }),
    // Only set when a real supported integration confirms acceptance.
    externalConfirmationRef: varchar("external_confirmation_ref", { length: 120 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientYearUnique: uniqueIndex("tax_years_client_year_key").on(t.clientId, t.year),
    dueIdx: index("tax_years_due_date_idx").on(t.dueDate),
  }),
);

export type ReturnStage =
  | "not_started"
  | "collecting"
  | "preparing"
  | "client_review"
  | "approved"
  | "filing"
  | "filed"
  | "accepted"
  | "rejected";

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    taxYearId: uuid("tax_year_id")
      .notNull()
      .references(() => taxYears.id, { onDelete: "cascade" }),
    formType: varchar("form_type", { length: 40 }).notNull(),
    stage: varchar("stage", { length: 30 }).notNull().default("not_started"),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    // Populated ONLY from a real integration. Never simulated.
    externalStatus: varchar("external_status", { length: 40 }),
    externalRef: varchar("external_ref", { length: 120 }),
    history: jsonb("history").$type<Array<{ at: string; stage: string; by?: string }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    engagementIdx: index("returns_engagement_id_idx").on(t.engagementId),
    stageIdx: index("returns_stage_idx").on(t.stage),
  }),
);

/* ============================ Documents =========================== */

export type DocumentReview = "pending" | "approved" | "rejected" | "superseded";
export type DocumentCategory =
  | "identity"
  | "income"
  | "deductions"
  | "prior_return"
  | "business"
  | "other";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    taxYearId: uuid("tax_year_id").references(() => taxYears.id, { onDelete: "set null" }),
    // Storage key, never a public URL. Private bucket by default.
    storageKey: varchar("storage_key", { length: 400 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    sanitizedFilename: varchar("sanitized_filename", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksum: varchar("checksum", { length: 64 }),
    category: varchar("category", { length: 40 }).notNull().default("other"),
    reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
    scanStatus: varchar("scan_status", { length: 20 }).notNull().default("pending"),
    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("documents_client_id_idx").on(t.clientId),
    taxYearIdx: index("documents_tax_year_id_idx").on(t.taxYearId),
    reviewIdx: index("documents_review_status_idx").on(t.reviewStatus),
    // Guarantees lookup by storage key is unique and indexed.
    storageUnique: uniqueIndex("documents_storage_key_key").on(t.storageKey),
  }),
);

export const documentRequests = pgTable(
  "document_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    taxYearId: uuid("tax_year_id").references(() => taxYears.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    required: boolean("required").notNull().default(true),
    dueAt: timestamp("due_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("document_requests_client_id_idx").on(t.clientId),
    openIdx: index("document_requests_fulfilled_at_idx").on(t.fulfilledAt),
  }),
);

/* ============================== Tasks ============================= */

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    priority: varchar("priority", { length: 12 }).notNull().default("normal"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    assigneeIdx: index("tasks_assigned_to_id_idx").on(t.assignedToId),
    statusIdx: index("tasks_status_idx").on(t.status),
    dueIdx: index("tasks_due_at_idx").on(t.dueAt),
  }),
);

/* =========================== Scheduling =========================== */

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("requested"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // Stored with the client, so a DST change never shifts a booking.
    timezone: varchar("timezone", { length: 60 }).notNull().default("America/New_York"),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    location: varchar("location", { length: 160 }),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: varchar("cancellation_reason", { length: 240 }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    // Overlap protection for concurrent reservations.
    staffTimeIdx: index("appointments_staff_starts_idx").on(t.staffId, t.startsAt),
    clientTimeIdx: index("appointments_client_starts_idx").on(t.clientId, t.startsAt),
    statusIdx: index("appointments_status_idx").on(t.status),
  }),
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    slotMinutes: integer("slot_minutes").notNull().default(30),
    bufferMinutes: integer("buffer_minutes").notNull().default(10),
    timezone: varchar("timezone", { length: 60 }).notNull().default("America/New_York"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    staffIdx: index("availability_rules_staff_id_idx").on(t.staffId),
  }),
);

export const appointmentBlocks = pgTable(
  "appointment_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    staffTimeIdx: index("appointment_blocks_staff_starts_idx").on(t.staffId, t.startsAt),
  }),
);

/* ============================ Messaging =========================== */

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 200 }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    clientUnreadCount: integer("client_unread_count").notNull().default(0),
    staffUnreadCount: integer("staff_unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("conversations_client_id_idx").on(t.clientId),
    recentIdx: index("conversations_last_message_at_idx").on(t.lastMessageAt),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_id_idx").on(t.conversationId),
  }),
);

/* ========================= Notifications ========================== */

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    smsPhone: varchar("sms_phone", { length: 30 }),
    // Never notify with tax content; categories only.
    notifyOnNewLead: boolean("notify_on_new_lead").notNull().default(true),
    notifyOnMessage: boolean("notify_on_message").notNull().default(true),
    notifyOnTaskDue: boolean("notify_on_task_due").notNull().default(true),
    notifyOnAppointment: boolean("notify_on_appointment").notNull().default(true),
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull(),
    template: varchar("template", { length: 60 }).notNull(),
    // Only non-sensitive payloads. Never store tax content here.
    payload: jsonb("payload").$type<Record<string, string | number | boolean>>(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: varchar("provider_message_id", { length: 160 }),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    userIdx: index("notifications_user_id_idx").on(t.userId),
    statusIdx: index("notifications_status_idx").on(t.status),
    // Idempotent delivery: one notification per dedupe key.
    dedupeUnique: uniqueIndex("notifications_dedupe_key_key")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  }),
);

/* ============================= Billing ============================ */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    number: varchar("number", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // Only a provider reference. Raw card details are never stored.
    paymentProvider: varchar("payment_provider", { length: 40 }),
    paymentReference: varchar("payment_reference", { length: 160 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("invoices_client_id_idx").on(t.clientId),
    numberUnique: uniqueIndex("invoices_number_key").on(t.number),
    statusIdx: index("invoices_status_idx").on(t.status),
  }),
);

/* ======================= Compliance and audit ===================== */

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 60 }).notNull(),
    granted: boolean("granted").notNull(),
    policyVersion: varchar("policy_version", { length: 20 }).notNull(),
    ipHash: varchar("ip_hash", { length: 32 }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    subjectIdx: index("consents_subject_user_id_idx").on(t.subjectUserId),
    clientIdx: index("consents_client_id_idx").on(t.clientId),
  }),
);

/* Append-only. No update or delete path exists for this table. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: varchar("actor_role", { length: 20 }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: varchar("entity_id", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    ipHash: varchar("ip_hash", { length: 32 }),
    requestId: varchar("request_id", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    actorIdx: index("audit_events_actor_id_idx").on(t.actorId),
    entityIdx: index("audit_events_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("audit_events_created_at_idx").on(t.createdAt),
  }),
);

/* ====================== Infrastructure tables ===================== */

/* Postgres-backed rate limiting, shared across instances. The previous
 * in-memory Map resets on every cold start and is per-process, so a free
 * instance that spins down silently loses all limits. */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: varchar("key", { length: 160 }).primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    windowIdx: index("rate_limit_counters_window_idx").on(t.windowStart),
  }),
);

/* Prevents duplicate submissions and retried payments creating double
 * records. Client-supplied key, unique, so a retry is a no-op. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: varchar("key", { length: 160 }).primaryKey(),
    scope: varchar("scope", { length: 60 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresIdx: index("idempotency_keys_expires_at_idx").on(t.expiresAt),
  }),
);

/* ====================== Canned staff responses ====================== */
export const cannedResponses = pgTable(
  "canned_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 80 }).notNull(),
    body: text("body").notNull(),
    shortcut: varchar("shortcut", { length: 12 }),
    sortOrder: integer("sort_order").notNull().default(100),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    activeIdx: index("canned_responses_active_idx").on(t.active, t.sortOrder),
  }),
);


/* ============================== Types ============================= */

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type CannedResponse = typeof cannedResponses.$inferSelect;

/* ========================== Signable forms ============================ *
 * In-app signing flow (replaces DocuSign for the practice's most
 * common 1040 / engagement-letter / consent workflows).
 *
 * Lifecycle:
 *   signable_documents.status = 'pending'  → client viewable, awaiting signature
 *                              'signed'   → all required signatures captured
 *                              'cancelled' → admin voided
 *
 * The body is JSONB so the practice can ship new form types (1040,
 * engagement letter, e-file authorization, disclosure) without
 * schema changes — the renderer picks a template by `kind` and the
 * fields live in `formData`.
 *
 * The signature itself is captured as base64 PNG (drawn on a
 * <canvas>) or as text + a typed-signature font snapshot, both stored
 * in `signatureData`. The audit trail records the consenting user,
 * IP, and user agent so this meets the ESIGN Act's attribution +
 * intent + record retention rules.
 */
export type SignableKind =
  | "form_1040"
  | "engagement_letter"
  | "efile_authorization"
  | "disclosure"
  | "custom";

export type SignableStatus = "pending" | "signed" | "cancelled";

export const signableDocuments = pgTable(
  "signable_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    preparedById: uuid("prepared_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 40 }).notNull().default("custom"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    formData: jsonb("form_data").notNull().default(sql`'{}'::jsonb`),
    requiredSigners: integer("required_signers").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    taxYear: integer("tax_year"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledById: uuid("cancelled_by_id").references(() => users.id, { onDelete: "set null" }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("signable_documents_client_idx").on(t.clientId),
    statusIdx: index("signable_documents_status_idx").on(t.status),
    kindIdx: index("signable_documents_kind_idx").on(t.kind),
  }),
);

/* One row per captured signature. A 1040 might require both
 * taxpayer + spouse; the admin sets `required_signers` on the
 * document. Once we have N signatures and N >= requiredSigners
 * the document flips to 'signed'. */
export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => signableDocuments.id, { onDelete: "cascade" }),
    signerId: uuid("signer_id").references(() => users.id, { onDelete: "set null" }),
    signerName: varchar("signer_name", { length: 160 }).notNull(),
    signerEmail: varchar("signer_email", { length: 180 }),
    signerRole: varchar("signer_role", { length: 60 }),
    signatureType: varchar("signature_type", { length: 20 }).notNull(),
    signatureData: text("signature_data").notNull(),
    consentText: text("consent_text").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().default(now),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
  },
  (t) => ({
    documentIdx: index("signatures_document_idx").on(t.documentId),
    signerIdx: index("signatures_signer_idx").on(t.signerId),
  }),
);

export type SignableDocument = typeof signableDocuments.$inferSelect;
export type Signature = typeof signatures.$inferSelect;

/* ====================== Email templates ========================= */
/* Practice-managed transactional email copy. Seeded with defaults; */
/* admins edit subject/body in Settings → Email templates.          */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 80 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    keyIdx: index("email_templates_key_idx").on(t.key),
  }),
);

export type EmailTemplate = typeof emailTemplates.$inferSelect;

/* ====================== Intake form config ====================== */
/* Admin-customizable fields for the public consultation/intake form. */
/* Core fields map to the 5-step dialog; custom fields are appended.   */
export const intakeFormFields = pgTable(
  "intake_form_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fieldKey: varchar("field_key", { length: 80 }).notNull().unique(),
    label: varchar("label", { length: 160 }).notNull(),
    fieldType: varchar("field_type", { length: 20 }).notNull().default("text"),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    options: jsonb("options"),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    keyIdx: index("intake_form_fields_key_idx").on(t.fieldKey),
    orderIdx: index("intake_form_fields_order_idx").on(t.sortOrder),
  }),
);

export type IntakeFormField = typeof intakeFormFields.$inferSelect;

/* ===================== Internal notes & audit ===================== */

/* Internal agent/admin notes. NEVER exposed via client APIs — the client
 * portal has no route that reads this table. Each note records its author
 * so the audit trail shows who wrote what and when. */
export const internalNotes = pgTable(
  "internal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    // Denormalized at write time so the timeline survives user renames.
    authorName: varchar("author_name", { length: 120 }),
    authorRole: varchar("author_role", { length: 20 }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => ({
    clientIdx: index("internal_notes_client_id_idx").on(t.clientId),
    createdIdx: index("internal_notes_created_at_idx").on(t.createdAt),
  }),
);

export type InternalNote = typeof internalNotes.$inferSelect;

/* Simple key/value app settings (admin-managed). */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
});

export type AppSetting = typeof appSettings.$inferSelect;
