import { pgTable, serial, text, timestamp, integer, boolean, varchar, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Existing consultations table, ported to Postgres
export const consultations = pgTable(
  "consultations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    service: text("service").notNull(),
    message: text("message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("consultations_email_idx").on(t.email),
    createdIdx: index("consultations_created_at_idx").on(t.createdAt),
  }),
);

// Phase 3 entities (forward-ready; created empty for now so future PRs only add columns).
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 180 }).notNull(),
  role: text("role").notNull().default("client"), // owner|admin|staff|client
  status: text("status").notNull().default("active"), // active|disabled|invited
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (t) => ({ emailUq: uniqueIndex("users_email_uq").on(t.email) }));
