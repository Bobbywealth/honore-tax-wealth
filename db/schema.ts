import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const consultations = sqliteTable("consultations",{
 id:integer("id").primaryKey({autoIncrement:true}),
 name:text("name").notNull(),email:text("email").notNull(),phone:text("phone").notNull(),service:text("service").notNull(),message:text("message").notNull().default(""),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
