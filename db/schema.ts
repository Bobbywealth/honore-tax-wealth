import { pgTable, bigserial, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
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
