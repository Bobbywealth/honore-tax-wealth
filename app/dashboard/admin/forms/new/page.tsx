import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import DashboardShell from "../../../DashboardShell";
import { loadAdminNavCounts } from "../../lib/nav-counts";
import { navForRole } from "../../_lib/nav";
import { checkAdminAccess } from "../../auth";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { TEMPLATES, type SignableKind } from "@/lib/signature-templates";
import NewFormClient from "./new-form-client";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(Object.keys(TEMPLATES));

export default async function NewFormPage({ searchParams }: { searchParams?: Promise<{ client?: string; kind?: string }> }) {
  const access = await checkAdminAccess(await searchParams);
  if (!access.allowed) return access.restricted;
  const me = await currentUser();
  const isAdmin = me?.role === "admin";
  const counts = await loadAdminNavCounts();
  const nav = navForRole(me?.role, counts);
  const sp = (await searchParams) ?? {};
  const preselectedClient = sp.client ?? "";
  const preselectedKind: SignableKind =
    (sp.kind && VALID_KINDS.has(sp.kind) ? sp.kind : "form_1040") as SignableKind;

  let clientRows: Array<{ id: string; displayName: string; email: string | null }> = [];
  let unavailable = false;

  try {
    await ensureMigrated();
    const db = getDb();
    clientRows = await db
      .select({ id: clients.id, displayName: clients.displayName, email: clients.email })
      .from(clients)
      .orderBy(asc(clients.displayName))
      .limit(500);
  } catch {
    unavailable = true;
  }

  // Filter for non-admin via owner_id exists check
  let scopedClients = clientRows;
  if (!isAdmin && me?.id) {
    try {
      const db = getDb();
      const owned = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          sql`exists (select 1 from engagements where engagements.client_id = ${clients.id} and engagements.owner_id = ${me.id})`,
        );
      const ownedIds = new Set(owned.map((o) => o.id));
      scopedClients = clientRows.filter((c) => ownedIds.has(c.id));
    } catch {
      scopedClients = [];
    }
  }

  return (
    <DashboardShell nav={nav} currentHref="/dashboard/admin/forms" audience="Admin" title="New signable form" description="Choose a template, pick a client, and pre-fill the data — the client signs in their portal.">
      <div className="adm-page-h">
        <div>
          <Link href="/dashboard/admin/forms" className="adm-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={12} /> Back to forms
          </Link>
          <h1 style={{ marginTop: 6 }}>New signable form</h1>
          <div className="sub">Pick a client, choose a template, and pre-fill the data.</div>
        </div>
      </div>

      {unavailable ? (
        <div className="adm-empty"><p>Could not load clients.</p></div>
      ) : (
        <NewFormClient clients={scopedClients} preselectedClient={preselectedClient} preselectedKind={preselectedKind} />
      )}
    </DashboardShell>
  );
}
