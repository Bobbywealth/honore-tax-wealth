import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, documentRequests, engagements, returns, tasks, taxYears } from "@/db/schema";

/**
 * Agent-facing client list state.
 *
 * The client Overview deliberately hides the internal workflow behind six
 * plain-language phases. The agent list does the opposite: it has to answer
 * "who needs me today?" in one screen, so it surfaces the working detail the
 * client never sees — tax year, return type, filing method, how many documents
 * are still missing, when anything last moved, and the next thing to do.
 *
 * Every bucket is derived from live rows. Nothing here is a stored label that
 * can drift out of sync with the underlying return.
 */

export type AgentListBucket =
  | "new"
  | "missing_documents"
  | "in_progress"
  | "awaiting_signature"
  | "ready_to_file"
  | "submitted"
  | "completed";

export type AgentListFilter = {
  key: AgentListBucket | "";
  label: string;
};

/** The chip row on the client list, in the order the work typically flows. */
export const AGENT_LIST_FILTERS: AgentListFilter[] = [
  { key: "", label: "All Clients" },
  { key: "new", label: "New" },
  { key: "missing_documents", label: "Missing Documents" },
  { key: "in_progress", label: "In Progress" },
  { key: "awaiting_signature", label: "Awaiting Signature" },
  { key: "ready_to_file", label: "Ready to File" },
  { key: "submitted", label: "Submitted" },
  { key: "completed", label: "Completed" },
];

export type AgentClientRow = {
  id: string;
  displayName: string;
  email: string | null;
  city: string | null;
  state: string | null;
  entityType: string;
  status: string;
  updatedAt: Date;
  bucket: AgentListBucket;
  /** Most recent tax year with work on it, or null when nothing is open. */
  taxYear: number | null;
  /** `returns.form_type` — e.g. 1040, 1120-S. */
  returnType: string | null;
  filingMethod: "efile" | "paper" | null;
  docsMissing: number;
  docsTotal: number;
  lastActivityAt: Date | null;
  /** Title of the next open task, or null when there is no follow-up. */
  nextStep: string | null;
  openTaskCount: number;
};

type RowInput = {
  id: string;
  displayName: string;
  email: string | null;
  city: string | null;
  state: string | null;
  entityType: string;
  status: string;
  updatedAt: Date;
  engagementStatus: string | null;
  returnStage: string | null;
  formType: string | null;
  filingMethod: string | null;
  taxYear: number | null;
  openRequests: number;
  requestedTotal: number;
  lastActivityAt: Date | null;
  nextStep: string | null;
  openTaskCount: number;
};

/**
 * Place a client in exactly one bucket.
 *
 * Precedence mirrors the client-facing phase but keeps the agent vocabulary.
 * "Missing Documents" is an interrupt and outranks the pipeline for the same
 * reason "Action Needed" does on the client side: if we are waiting on the
 * client, that is what the agent needs to see first regardless of how far the
 * return has otherwise moved.
 */
export function bucketFor(input: {
  engagementStatus: string | null;
  returnStage: string | null;
  openRequests: number;
}): AgentListBucket {
  const engagement = (input.engagementStatus ?? "").toLowerCase();
  const stage = (input.returnStage ?? "").toLowerCase();

  if (input.openRequests > 0) return "missing_documents";
  if (stage === "client_review" || engagement === "client_review") return "awaiting_signature";
  if (engagement === "complete" || stage === "accepted") return "completed";
  if (engagement === "filed" || stage === "filed" || stage === "filing") return "submitted";
  if (engagement === "ready_to_file" || stage === "approved") return "ready_to_file";
  if (engagement === "in_preparation" || stage === "preparing") return "in_progress";
  return "new";
}

function toRow(input: RowInput): AgentClientRow {
  const filing = (input.filingMethod ?? "").toLowerCase();
  return {
    id: input.id,
    displayName: input.displayName,
    email: input.email,
    city: input.city,
    state: input.state,
    entityType: input.entityType,
    status: input.status,
    updatedAt: input.updatedAt,
    bucket: bucketFor({
      engagementStatus: input.engagementStatus,
      returnStage: input.returnStage,
      openRequests: input.openRequests,
    }),
    taxYear: input.taxYear,
    returnType: input.formType,
    filingMethod: filing === "paper" ? "paper" : input.filingMethod ? "efile" : null,
    docsMissing: input.openRequests,
    docsTotal: input.requestedTotal,
    lastActivityAt: input.lastActivityAt,
    nextStep: input.nextStep,
    openTaskCount: input.openTaskCount,
  };
}

/**
 * Load the working state for a set of clients in a bounded number of queries.
 *
 * `clientIds` is always the caller's already-scoped set (see
 * `scopedClientIdsFor`) — this module never decides who may see whom.
 */
export async function loadAgentClientRows(clientIds: string[]): Promise<AgentClientRow[]> {
  if (clientIds.length === 0) return [];
  const db = getDb();

  const base = await db
    .select({
      id: clients.id,
      displayName: clients.displayName,
      email: clients.email,
      city: clients.city,
      state: clients.state,
      entityType: clients.entityType,
      status: clients.status,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .where(inArray(clients.id, clientIds));

  // One representative engagement per client: the most recently touched one,
  // which is the one an agent is actually working on.
  const engRows = await db
    .select({
      clientId: engagements.clientId,
      status: engagements.status,
      updatedAt: engagements.updatedAt,
    })
    .from(engagements)
    .where(and(inArray(engagements.clientId, clientIds), isNull(engagements.archivedAt)))
    .orderBy(desc(engagements.updatedAt));

  const engByClient = new Map<string, { status: string; updatedAt: Date }>();
  for (const e of engRows) if (!engByClient.has(e.clientId)) engByClient.set(e.clientId, e);

  const engIds = Array.from(engByClient.values()).length
    ? (
        await db
          .select({ id: engagements.id, clientId: engagements.clientId })
          .from(engagements)
          .where(and(inArray(engagements.clientId, clientIds), isNull(engagements.archivedAt)))
      ).map((r) => ({ id: r.id, clientId: r.clientId }))
    : [];

  // Return detail keyed by engagement, then folded back to a client.
  const retRows = engIds.length
    ? await db
        .select({
          engagementId: returns.engagementId,
          formType: returns.formType,
          filingMethod: returns.filingMethod,
          stage: returns.stage,
          updatedAt: returns.updatedAt,
          taxYear: taxYears.year,
        })
        .from(returns)
        .leftJoin(taxYears, eq(returns.taxYearId, taxYears.id))
        .where(inArray(returns.engagementId, engIds.map((e) => e.id)))
        .orderBy(desc(returns.updatedAt))
    : [];

  const engToClient = new Map(engIds.map((e) => [e.id, e.clientId]));
  const retByClient = new Map<
    string,
    { formType: string; filingMethod: string; stage: string; updatedAt: Date; taxYear: number | null }
  >();
  for (const r of retRows) {
    const cid = engToClient.get(r.engagementId);
    if (cid && !retByClient.has(cid)) {
      retByClient.set(cid, {
        formType: r.formType,
        filingMethod: r.filingMethod,
        stage: r.stage,
        updatedAt: r.updatedAt,
        taxYear: r.taxYear ?? null,
      });
    }
  }

  // Document requests. `fulfilledAt` is what separates "still missing" from
  // "we asked and they delivered".
  const reqRows = await db
    .select({
      clientId: documentRequests.clientId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${documentRequests.fulfilledAt} is null)::int`,
    })
    .from(documentRequests)
    .where(inArray(documentRequests.clientId, clientIds))
    .groupBy(documentRequests.clientId);

  const reqByClient = new Map(reqRows.map((r) => [r.clientId, r]));

  // Follow-up: the next open task by due date (nulls last), plus a count.
  const taskRows = await db
    .select({
      clientId: tasks.clientId,
      title: tasks.title,
      dueAt: tasks.dueAt,
      status: tasks.status,
    })
    .from(tasks)
    .where(and(inArray(tasks.clientId, clientIds), eq(tasks.status, "open")))
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt));

  const taskByClient = new Map<string, { title: string; count: number }>();
  for (const t of taskRows) {
    // tasks.client_id is nullable (a task can exist without a client), so the
    // map is keyed on the non-null subset only.
    if (!t.clientId) continue;
    const existing = taskByClient.get(t.clientId);
    if (existing) existing.count += 1;
    else taskByClient.set(t.clientId, { title: t.title, count: 1 });
  }

  return base.map((b) => {
    const eng = engByClient.get(b.id);
    const ret = retByClient.get(b.id);
    const req = reqByClient.get(b.id);
    const task = taskByClient.get(b.id);

    const candidates = [b.updatedAt, eng?.updatedAt, ret?.updatedAt].filter(
      (d): d is Date => d instanceof Date,
    );
    const lastActivityAt =
      candidates.length > 0
        ? new Date(Math.max(...candidates.map((d) => d.getTime())))
        : null;

    return toRow({
      ...b,
      engagementStatus: eng?.status ?? null,
      returnStage: ret?.stage ?? null,
      formType: ret?.formType ?? null,
      filingMethod: ret?.filingMethod ?? null,
      taxYear: ret?.taxYear ?? null,
      openRequests: Number(req?.open ?? 0),
      requestedTotal: Number(req?.total ?? 0),
      lastActivityAt,
      nextStep: task?.title ?? null,
      openTaskCount: task?.count ?? 0,
    });
  });
}
