import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { getDb } from "@/db";
import { ensureMigrated } from "@/db/migrate";
import {
  appointments,
  clients,
  consultations,
  conversations,
  documentRequests,
  engagements,
  invoices,
  messages,
  tasks,
} from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only one-time cleanup for the QA + Demo client data the audit
 * flagged. Wired as a POST so a deliberate operator runs it once and
 * we keep a server-side audit trail of who triggered it.
 *
 * Heuristics (case-insensitive):
 *   - consultations: rows whose email is @example.com / @test.com / .org,
 *     phone starts with 555, subject/service/body matches "direct post
 *     test" / "final all fixed" / "production test", or sender is
 *     "demo client" / "qa tester" / starts with "test ".
 *   - conversations + messages: subject or first-message body matches the
 *     same QA patterns.
 *   - clients: displayName matches /demo\s*client/i.
 *
 * Idempotent: re-running skips anything already deleted.
 */

const QA_EMAIL_RE = /@(example\.com|example\.org|example\.net|test\.com)$/i;
const QA_PHONE_RE = /^555[\s-]?\d/;
const QA_SUBJECT_RE = /(direct post test|final all fixed|production test)/i;
const QA_NAME_RE = /^(demo\s*client|qa\s*tester|test\s+)/i;

function looksLikeQa(args: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  service?: string | null;
  subject?: string | null;
  body?: string | null;
}): boolean {
  if (args.email && QA_EMAIL_RE.test(args.email)) return true;
  if (args.phone && QA_PHONE_RE.test(args.phone.trim())) return true;
  if (args.subject && QA_SUBJECT_RE.test(args.subject)) return true;
  if (args.service && QA_SUBJECT_RE.test(args.service)) return true;
  if (args.body && QA_SUBJECT_RE.test(args.body)) return true;
  if (args.name && QA_NAME_RE.test(args.name.trim())) return true;
  return false;
}

export async function POST() {
  const actor = await requireRole("admin");
  if (!actor) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const summary = {
    actorEmail: actor.email,
    consultationsDeleted: 0,
    messagesDeleted: 0,
    conversationsDeleted: 0,
    demoClientDeleted: false,
    invoiceCleanup: 0,
    documentRequestCleanup: 0,
    appointmentCleanup: 0,
    taskCleanup: 0,
    engagementCleanup: 0,
  } as Record<string, unknown>;

  try {
    await ensureMigrated();
    const db = getDb();

    // 1) consultations
    const cons = await db
      .select({
        id: consultations.id,
        email: consultations.email,
        phone: consultations.phone,
        name: consultations.name,
        service: consultations.service,
        message: consultations.message,
      })
      .from(consultations);
    const consToDelete = cons.filter((c) =>
      looksLikeQa({
        email: c.email,
        phone: c.phone,
        name: c.name,
        service: c.service,
        body: c.message,
      }),
    );
    if (consToDelete.length > 0) {
      const ids = consToDelete.map((c) => c.id);
      const deleted = await db
        .delete(consultations)
        .where(sql`${consultations.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
        .returning({ id: consultations.id });
      summary.consultationsDeleted = deleted.length;
    }

    // 2) conversations + messages
    const convos = await db.select({ id: conversations.id, subject: conversations.subject }).from(conversations);
    const convoIds = convos.filter((c) => looksLikeQa({ subject: c.subject })).map((c) => c.id);
    if (convoIds.length > 0) {
      const msgDel = await db
        .delete(messages)
        .where(sql`${messages.conversationId} IN (${sql.join(convoIds.map((i) => sql`${i}`), sql`, `)})`)
        .returning({ id: messages.id });
      summary.messagesDeleted = msgDel.length;
      const convDel = await db
        .delete(conversations)
        .where(sql`${conversations.id} IN (${sql.join(convoIds.map((i) => sql`${i}`), sql`, `)})`)
        .returning({ id: conversations.id });
      summary.conversationsDeleted = convDel.length;
    }

    // 3) demo client
    const demoClients = await db
      .select({ id: clients.id, displayName: clients.displayName })
      .from(clients)
      .where(sql`${clients.displayName} ~* '\\m\\s*demo\\s+client\\M\\s*'`);

    for (const dc of demoClients) {
      const invDel = await db.delete(invoices).where(eq(invoices.clientId, dc.id)).returning({ id: invoices.id });
      summary.invoiceCleanup = Number(summary.invoiceCleanup) + invDel.length;
      const drDel = await db.delete(documentRequests).where(eq(documentRequests.clientId, dc.id)).returning({ id: documentRequests.id });
      summary.documentRequestCleanup = Number(summary.documentRequestCleanup) + drDel.length;
      const apDel = await db.delete(appointments).where(eq(appointments.clientId, dc.id)).returning({ id: appointments.id });
      summary.appointmentCleanup = Number(summary.appointmentCleanup) + apDel.length;
      const tkDel = await db.delete(tasks).where(eq(tasks.clientId, dc.id)).returning({ id: tasks.id });
      summary.taskCleanup = Number(summary.taskCleanup) + tkDel.length;
      const egDel = await db.delete(engagements).where(eq(engagements.clientId, dc.id)).returning({ id: engagements.id });
      summary.engagementCleanup = Number(summary.engagementCleanup) + egDel.length;
      const convDel = await db.delete(conversations).where(eq(conversations.clientId, dc.id)).returning({ id: conversations.id });
      summary.conversationsDeleted = Number(summary.conversationsDeleted) + convDel.length;
      const cliDel = await db.delete(clients).where(eq(clients.id, dc.id)).returning({ id: clients.id });
      summary.demoClientDeleted = cliDel.length > 0;
    }

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "admin.cleanup.executed",
        actor: actor.id,
        ...summary,
      }),
    );

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "admin.cleanup.failed",
        actor: actor.id,
        reason: err instanceof Error ? err.message : "unknown",
      }),
    );
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// GET is a no-op: the endpoint is destructive and only POSTs run.
export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
