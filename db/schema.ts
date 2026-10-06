import { pgTable, bigserial, text, varchar, timestamp, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const consultations = pgTable(
  "consultations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    service: text("service").notNull(),
    message: text("message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("consultations_email_idx").on(t.email),
    createdAtIdx: index("consultations_created_at_idx").on(t.createdAt),
  }),
);

export type Role = "client" | "staff" | "admin";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 180 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("client"),
    displayName: varchar("display_name", { length: 120 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_key").on(t.email),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the bearer token. The raw token is never stored, so a
    // database leak cannot be replayed as a live session.
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    userIdx: index("sessions_user_id_idx").on(t.userId),
    expiresIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);
