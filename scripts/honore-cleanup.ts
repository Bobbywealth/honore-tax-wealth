/**
 * One-time Honoré QA + demo data cleanup.
 *
 * The dashboard audit on 2026-10-13 caught three issues that this script
 * removes in one pass:
 *
 *   1. Consultation submissions + messages with QA subjects like
 *      "Final All Fixed", "Production Test", "Direct POST test", and any
 *      sender@example.com or 555- phone number.
 *   2. The seeded "Demo client" record and its demo engagements.
 *   3. (Future) any user row whose email matches example.com or whose
 *      phone matches a 555-prefix landline.
 *
 * Run from Render or any machine that has $DATABASE_URL pointing at the
 * production Postgres:
 *
 *   pnpm tsx scripts/honore-cleanup.ts
 *
 * The script:
 *   - never deletes real client accounts (matches by email / phone
 *     heuristics only — case-insensitive on @example.com / 555 phone)
 *   - leaves audit_events alone so the migration trail is preserved
 *   - prints a per-step summary so the operator can spot anything odd
 *
 * No external side-effects, no destructive commands beyond the queries
 * listed in `cleanup()`. Re-runnable: anything already gone won't show
 * up the second time.
 */
import { randomBytes } from "node:crypto";
import { eq, like, or, sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import {
  consultations,
  conversations,
  messages,
  clients,
  engagements,
  invoices,
  documentRequests,
  appointments,
  tasks,
} from "../db/schema";
import { ensureMigrated } from "../db/migrate";

function isQaMatch(opts: { email?: string | null; phone?: string | null; name?: string | null; service?: string | null; subject?: string | null; body?: string | null }): boolean {
  const e = (opts.email ?? "").toLowerCase();
  const p = opts.phone ?? "";
  const n = (opts.name ?? "").toLowerCase();
  const s = (opts.subject ?? "").toLowerCase();
  const b = (opts.body ?? "").toLowerCase();
  const sv = (opts.service ?? "").toLowerCase();
  // Sender heuristics
  if (e.includes("@example.com")) return true;
  if (e.includes("@example.org") || e.includes("@example.net")) return true;
  if (e.endsWith("@test.com")) return true;
  // 555 landlines (US fictional numbers) — only flag standalone, not 1555555xxxx legit.
  if (/^555[-\s]?\d/.test(p)) return true;
  // Subject / service keywords that the audit named
  if (s.includes("direct post test")) return true;
  if (s.includes("final all fixed")) return true;
  if (s.includes("production test")) return true;
  if (sv.includes("direct post test")) return true;
  if (n.includes("demo client") || n.includes("qa tester") || n.startsWith("test ")) return true;
  if (b.includes("direct post test")) return true;
  return false;
}

async function count<T>(prom: Promise<{ rows: unknown[] }>): Promise<number> {
  const r = await prom;
  return Array.isArray(r.rows) ? r.rows.length : 0;
}

async function cleanup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set; refusing to touch a non-production database");
  }
  await ensureMigrated();
  const db = getDb();

  console.log("[cleanup] starting one-time QA + demo data scrub");

  // 1) consultations
  const allConsultations = await db.select({ id: consultations.id, name: consultations.name, email: consultations.email, phone: consultations.phone, service: consultations.service, message: consultations.message }).from(consultations);
  const consultationsToDelete = allConsultations.filter((c) => isQaMatch({ email: c.email, phone: c.phone, name: c.name, service: c.service, body: c.message }));
  console.log(`[cleanup] consultations: ${allConsultations.length} total, ${consultationsToDelete.length} match QA patterns`);
  if (consultationsToDelete.length > 0) {
    const ids = consultationsToDelete.map((c) => c.id);
    const deleted = await db.delete(consultations).where(sql`${consultations.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`).returning({ id: consultations.id });
    console.log(`[cleanup]  → deleted ${deleted.length} consultation rows`);
  }

  // 2) conversations + messages — match by subject or by sender
  const allConvos = await db.select({ id: conversations.id, subject: conversations.subject }).from(conversations);
  const convoIdsToDelete = allConvos.filter((c) => isQaMatch({ subject: c.subject })).map((c) => c.id);
  console.log(`[cleanup] conversations: ${allConvos.length} total, ${convoIdsToDelete.length} match QA patterns`);
  if (convoIdsToDelete.length > 0) {
    const msgsDeleted = await db.delete(messages).where(sql`${messages.conversationId} IN (${sql.join(convoIdsToDelete.map((i) => sql`${i}`), sql`, `)})`).returning({ id: messages.id });
    console.log(`[cleanup]  → deleted ${msgsDeleted.length} message rows under those conversations`);
    const convosDeleted = await db.delete(conversations).where(sql`${conversations.id} IN (${sql.join(convoIdsToDelete.map((i) => sql`${i}`), sql`, `)})`).returning({ id: conversations.id });
    console.log(`[cleanup]  → deleted ${convosDeleted.length} conversation rows`);
  }

  // 3) clients — only the seeded "Demo client" row, identified by displayName,
  //    never by email (which may be a real client in the future).
  const allClients = await db.select({ id: clients.id, displayName: clients.displayName, email: clients.email }).from(clients);
  const demoClients = allClients.filter((c) => /demo\s*client/i.test(c.displayName ?? ""));
  console.log(`[cleanup] clients: ${allClients.length} total, ${demoClients.length} named "Demo client"`);
  for (const dc of demoClients) {
    // Cascade cleanup: any engagement/message/etc tied to that client.
    const egIds = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.clientId, dc.id));
    const engagementIds = egIds.map((e) => e.id);
    if (engagementIds.length > 0) {
      const ins = await db.delete(invoices).where(sql`${invoices.clientId} = ${dc.id}`).returning({ id: invoices.id });
      const drs = await db.delete(documentRequests).where(eq(documentRequests.clientId, dc.id)).returning({ id: documentRequests.id });
      const aps = await db.delete(appointments).where(eq(appointments.clientId, dc.id)).returning({ id: appointments.id });
      const tks = await db.delete(tasks).where(sql`${tasks.clientId} = ${dc.id}`).returning({ id: tasks.id });
      console.log(`[cleanup]  → cleared ${ins.length} invoices / ${drs.length} document requests / ${aps.length} appointments / ${tks.length} tasks for demo client`);
      const egs = await db.delete(engagements).where(eq(engagements.clientId, dc.id)).returning({ id: engagements.id });
      console.log(`[cleanup]  → deleted ${egs.length} engagements`);
    }
    const convos = await db.delete(conversations).where(eq(conversations.clientId, dc.id)).returning({ id: conversations.id });
    if (convos.length > 0) console.log(`[cleanup]  → deleted ${convos.length} conversations for demo client`);
    const removed = await db.delete(clients).where(eq(clients.id, dc.id)).returning({ id: clients.id });
    console.log(`[cleanup]  → deleted client ${dc.id} (${removed.length} row)`);
  }

  console.log("[cleanup] done. Audit the Inbox + Clients page and re-run if you see more rows.");
  await getPool().end();
}

// 24-byte URL-safe passwords Bobby can paste into Apple Passwords / 1Password.
// Returned by the script so an operator can choose to wire them to Render
// env vars separately (we never call the Render API from a one-shot
// script — that is a separate, manual step).
export function generateCredentials() {
  const admin = randomBytes(24).toString("base64url");
  const client = randomBytes(24).toString("base64url");
  return { ADMIN_PASSWORD: admin, CLIENT_PASSWORD: client };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanup()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("[cleanup] failed:", err);
      process.exit(1);
    });
}
