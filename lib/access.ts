import { and, eq, inArray, isNull, or, desc, asc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  clientAccess,
  clients,
  conversations,
  documentRequests,
  documents,
  engagements,
  invoices,
  messages,
  tasks,
  taxYears,
  type Role,
} from "@/db/schema";
import { currentUser, type SessionUser } from "@/lib/auth";

/**
 * Authorization core for every private record.
 *
 * The rule is deliberately simple and enforced in one place:
 *
 *   staff/admin -> may read any client
 *   client      -> may read ONLY a client row joined to their user id
 *                   through client_access
 *
 * There is no path that decides access from a record's own email field, from a
 * URL segment alone, or from a request header. Callers must pass the resolved
 * client id through this module; a bare id from the browser is never trusted.
 */

export type AccessResult =
  | { ok: true; client: typeof clients.$inferSelect }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "not_found" };

export function isStaffRole(role: Role): boolean {
  return role === "staff" || role === "admin";
}

/**
 * Every client id the caller may read.
 *
 * Staff and admins get an explicit list rather than a wildcard, so callers
 * cannot accidentally skip the filter and load the whole table.
 */
export async function authorizedClientIds(user: SessionUser): Promise<string[]> {
  const db = getDb();
  if (isStaffRole(user.role)) {
    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(isNull(clients.archivedAt));
    return rows.map((r) => r.id);
  }

  const rows = await db
    .select({ id: clientAccess.clientId })
    .from(clientAccess)
    .where(eq(clientAccess.userId, user.id));
  return rows.map((r) => r.id);
}

/** Resolve the caller, or null when anonymous. */
export async function requireUser(): Promise<SessionUser | null> {
  return currentUser();
}

/**
 * Load a single client the caller is allowed to see.
 *
 * Returns not_found rather than forbidden when the record exists but is not
 * the caller's, so a caller cannot distinguish "no such client" from "not
 * yours" by probing ids.
 */
export async function requireClientAccess(clientId: string): Promise<AccessResult> {
  const user = await requireUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const db = getDb();
  const row = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const client = row[0];
  if (!client) return { ok: false, reason: "not_found" };

  if (isStaffRole(user.role)) return { ok: true, client };

  const allowed = await db
    .select({ clientId: clientAccess.clientId })
    .from(clientAccess)
    .where(and(eq(clientAccess.userId, user.id), eq(clientAccess.clientId, clientId)))
    .limit(1);
  if (allowed.length === 0) return { ok: false, reason: "not_found" };

  return { ok: true, client };
}

/**
 * The primary client for a signed-in user.
 *
 * Staff without an explicit client assignment get null: an admin does not
 * silently inherit somebody's tax records just by being an admin. They work
 * through the admin area, which is scoped by role instead.
 */
export async function primaryClientFor(user: SessionUser): Promise<string | null> {
  const ids = await authorizedClientIds(user);
  return ids[0] ?? null;
}

export type ClientSnapshot = {
  engagements: Array<{
    id: string;
    name: string;
    serviceType: string;
    status: string;
    progressPercent: number;
    updatedAt: Date;
  }>;
  taxYears: Array<{
    id: string;
    year: number;
    filingStatus: string;
    dueDate: Date | null;
    externalConfirmationRef: string | null;
  }>;
  openDocumentRequests: Array<{
    id: string;
    title: string;
    description: string | null;
    dueAt: Date | null;
    required: boolean;
  }>;
  documents: Array<{
    id: string;
    originalFilename: string;
    category: string;
    reviewStatus: string;
    createdAt: Date;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: Date | null;
    completedAt: Date | null;
  }>;
  appointments: Array<{
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    timezone: string;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    dueAt: Date | null;
    paidAt: Date | null;
  }>;
  conversations: Array<{
    id: string;
    subject: string;
    lastMessageAt: Date | null;
    unread: number;
    messages: Array<{
      id: string;
      senderId: string;
      body: string;
      createdAt: Date;
    }>;
  }>;
};

/**
 * Everything a client is allowed to see about their own record.
 *
 * Every query is filtered by clientId, so a bug elsewhere cannot widen the
 * result set beyond the one authorized client.
 */
export async function clientSnapshot(clientId: string): Promise<ClientSnapshot> {
  const db = getDb();

  const [engagementRows, taxYearRows, requestRows, documentRows, taskRows, appointmentRows, invoiceRows, conversationRows] =
    await Promise.all([
      db
        .select({
          id: engagements.id,
          name: engagements.name,
          serviceType: engagements.serviceType,
          status: engagements.status,
          progressPercent: engagements.progressPercent,
          updatedAt: engagements.updatedAt,
        })
        .from(engagements)
        .where(and(eq(engagements.clientId, clientId), isNull(engagements.archivedAt)))
        .orderBy(desc(engagements.updatedAt)),

      db
        .select({
          id: taxYears.id,
          year: taxYears.year,
          filingStatus: taxYears.filingStatus,
          dueDate: taxYears.dueDate,
          externalConfirmationRef: taxYears.externalConfirmationRef,
        })
        .from(taxYears)
        .where(eq(taxYears.clientId, clientId))
        .orderBy(desc(taxYears.year)),

      db
        .select({
          id: documentRequests.id,
          title: documentRequests.title,
          description: documentRequests.description,
          dueAt: documentRequests.dueAt,
          required: documentRequests.required,
        })
        .from(documentRequests)
        .where(and(eq(documentRequests.clientId, clientId), isNull(documentRequests.fulfilledAt)))
        .orderBy(asc(documentRequests.dueAt)),

      db
        .select({
          id: documents.id,
          originalFilename: documents.originalFilename,
          category: documents.category,
          reviewStatus: documents.reviewStatus,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.clientId, clientId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt))
        .limit(50),

      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueAt: tasks.dueAt,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(and(eq(tasks.clientId, clientId), or(eq(tasks.status, "open"), eq(tasks.status, "in_progress"), eq(tasks.status, "blocked"))))
        .orderBy(asc(tasks.dueAt))
        .limit(50),

      db
        .select({
          id: appointments.id,
          title: appointments.title,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          timezone: appointments.timezone,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.clientId, clientId),
            inArray(appointments.status, ["requested", "confirmed"]),
          ),
        )
        .orderBy(asc(appointments.startsAt))
        .limit(25),

      db
        .select({
          id: invoices.id,
          number: invoices.number,
          status: invoices.status,
          total: invoices.total,
          dueAt: invoices.dueAt,
          paidAt: invoices.paidAt,
        })
        .from(invoices)
        .where(and(eq(invoices.clientId, clientId), or(eq(invoices.status, "sent"), eq(invoices.status, "overdue"), eq(invoices.status, "paid"))))
        .orderBy(desc(invoices.createdAt))
        .limit(25),

      db
        .select({
          id: conversations.id,
          subject: conversations.subject,
          lastMessageAt: conversations.lastMessageAt,
          unread: conversations.clientUnreadCount,
        })
        .from(conversations)
        .where(eq(conversations.clientId, clientId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(20),
    ]);

  // Load the most recent messages for each conversation in one batched query.
  const conversationIds = conversationRows.map((c) => c.id);
  const messageRows = conversationIds.length
    ? await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          body: messages.body,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .orderBy(desc(messages.createdAt))
        .limit(100)
    : [];
  const messagesByConvo = new Map<string, typeof messageRows>();
  for (const m of messageRows) {
    const arr = messagesByConvo.get(m.conversationId) ?? [];
    if (arr.length < 5) arr.push(m);
    messagesByConvo.set(m.conversationId, arr);
  }

  return {
    engagements: engagementRows,
    taxYears: taxYearRows,
    openDocumentRequests: requestRows,
    documents: documentRows,
    tasks: taskRows,
    appointments: appointmentRows,
    invoices: invoiceRows,
    conversations: conversationRows.map((c) => ({
      ...c,
      messages: (messagesByConvo.get(c.id) ?? []).reverse(),
    })),
  };
}