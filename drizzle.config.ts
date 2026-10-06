import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgresql://localhost:5432/honore";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
});