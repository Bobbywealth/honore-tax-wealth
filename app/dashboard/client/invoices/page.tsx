import { redirect } from "next/navigation";
import { ArrowUpRight, Receipt, Download, Calendar } from "lucide-react";
import DashboardShell from "../../DashboardShell";
import OpenChatButton from "../_components/OpenChatButton";
import { currentUser } from "@/lib/auth";
import { clientNav } from "../_lib/nav";
import { primaryClientFor } from "@/lib/access";
import { getDb } from "@/db";
import { invoices, engagements } from "@/db/schema";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { ensureMigrated } from "@/db/migrate";

export const dynamic = "force-dynamic";

function dateOnly(value: Date | null, timeZone = "America/New_York"): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
}
function relative(value: Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateOnly(value);
}

async function loadCounts(clientId: string) {
  if (!process.env.DATABASE_URL) return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
  try {
    await ensureMigrated();
    const db = getDb();
    const schema = await import("@/db/schema");
    const [eg, req, appt, inv] = await Promise.all([
      db.select({ c: count() }).from(schema.engagements).where(and(eq(schema.engagements.clientId, clientId), isNull(schema.engagements.archivedAt))),
      db.select({ c: count() }).from(schema.documentRequests).where(and(eq(schema.documentRequests.clientId, clientId), isNull(schema.documentRequests.fulfilledAt))),
      db.select({ c: count() }).from(schema.appointments).where(and(eq(schema.appointments.clientId, clientId), sql`${schema.appointments.status} IN ('requested','confirmed')`)),
      db.select({ c: count() }).from(schema.invoices).where(and(eq(schema.invoices.clientId, clientId), sql`${schema.invoices.status} IN ('sent','overdue')`)),
    ]);
    return {
      activeEngagements: eg[0]?.c ?? 0,
      openRequests: req[0]?.c ?? 0,
      upcomingAppointments: appt[0]?.c ?? 0,
      unpaidInvoices: inv[0]?.c ?? 0,
    };
  } catch {
    return { activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 };
  }
}

export default async function ClientInvoicesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/client/invoices");
  const clientId = await primaryClientFor(user);
  const nav = clientNav({ activeEngagements: 0, openRequests: 0, upcomingAppointments: 0, unpaidInvoices: 0 });

  if (!clientId) {
    return (
      <DashboardShell audience="Client" title="Invoices" description="" nav={nav} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/invoices">
        <div className="dashboard-alert"><p><strong>No client record linked.</strong></p></div>
      </DashboardShell>
    );
  }

  const counts = await loadCounts(clientId);
  const nav2 = clientNav(counts);

  let unpaidRows: Array<{ id: string; number: string; status: string; subtotal: string; tax: string; total: string; currency: string; dueAt: Date | null; paidAt: Date | null; createdAt: Date }> = [];
  let paidRows: Array<{ id: string; number: string; total: string; paidAt: Date | null; createdAt: Date }> = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const db = getDb();

      unpaidRows = await db
        .select({
          id: invoices.id, number: invoices.number, status: invoices.status,
          subtotal: invoices.subtotal, tax: invoices.tax, total: invoices.total, currency: invoices.currency,
          dueAt: invoices.dueAt, paidAt: invoices.paidAt, createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(and(eq(invoices.clientId, clientId), sql`${invoices.status} IN ('sent','overdue','open')`))
        .orderBy(asc(invoices.dueAt));

      paidRows = await db
        .select({ id: invoice.id, number: invoice.number, total: invoice.total, paidAt: invoice.paidAt, createdAt: invoice.createdAt })
        .from(invoice)
        .where(and(eq(invoice.clientId, clientId), sql`${invoice.status} = 'paid'`))
        .orderBy(desc(invoice.paidAt))
        .limit(12);
    }
  } catch {
    // best-effort
  }

  const totalDue = unpaidRows.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPaid = paidRows.reduce((s, i) => s + Number(i.total || 0), 0);
  const overdueCount = unpaidRows.filter((i) => i.status === "overdue" || (i.dueAt && new Date(i.dueAt).getTime() < Date.now())).length;

  return (
    <DashboardShell audience="Client" title="Invoices" description="Your invoice history and balance with your preparer." nav={nav2} userLabel={user.displayName ?? user.email} currentHref="/dashboard/client/invoices">

      <section className="client-kpi-strip" aria-label="Invoices summary">
        <article className={`client-kpi${totalDue > 0 ? " is-warn" : ""}`}>
          <small>Open balance</small>
          <strong>${totalDue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
          <p>{unpaidRows.length} invoice{unpaidRows.length === 1 ? "" : "s"}{" "}outstanding.</p>
        </article>
        <article className={`client-kpi${overdueCount > 0 ? " is-alert" : ""}`}>
          <small>Overdue</small>
          <strong>{overdueCount}</strong>
          <p>{overdueCount ? "Past due." : "All within terms."}</p>
        </article>
        <article className="client-kpi">
          <small>Paid this year</small>
          <strong>${totalPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong>
          <p>Across{" "}{paidRows.length} paid invoice{paidRows.length === 1 ? "" : "s"}.</p>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow"><Receipt size={14} aria-hidden="true" /> OPEN</span>
          <h2>Outstanding invoices</h2>
          <p className="dashboard-quiet">Click an invoice to see the full breakdown.</p>
        </div>

        {unpaidRows.length === 0 ? (
          <div className="dashboard-empty">
            <h3>Nothing owed right now</h3>
            <p>You will see new invoices here as your preparer issues them.</p>
          </div>
        ) : (
          <ul className="dashboard-invoice-list">
            {unpaidRows.map((inv) => {
              const overdue = inv.status === "overdue" || (inv.dueAt && new Date(inv.dueAt).getTime() < Date.now());
              return (
                <li key={inv.id} className="dashboard-invoice-i">
                  <div className="dashboard-invoice-row1">
                    <strong>{inv.number}</strong>
                    <span className={`dashboard-tag ${overdue ? "is-bad" : inv.status === "sent" ? "is-pending" : "is-pending"}`}>
                      {overdue ? "Overdue" : inv.status === "sent" ? "Sent" : "Open"}
                    </span>
                  </div>
                  <div className="dashboard-invoice-row2">
                    <span className="dashboard-invoice-total">${inv.total}</span>
                    <span className="dashboard-muted">
                      {inv.dueAt ? <><Calendar size={12} aria-hidden="true" /> Due {dateOnly(inv.dueAt)}</> : `Issued ${dateOnly(inv.createdAt)}`}
                    </span>
                    <span className="dashboard-muted">Subtotal ${inv.subtotal} · Tax ${inv.tax} {inv.currency}</span>
                  </div>
                  <div className="dashboard-invoice-actions">
                    <a href={`mailto:billing@honore-tax.com?subject=Invoice%20${encodeURIComponent(inv.number)}`} className="dashboard-button dashboard-button-secondary">
                      Email invoice <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <span className="dashboard-eyebrow">PAID</span>
          <h2>Payment history</h2>
          <p className="dashboard-quiet">All settled invoices for this account.</p>
        </div>
        {paidRows.length === 0 ? (
          <div className="dashboard-empty">
            <h3>No payments yet</h3>
            <p>Settled invoices will appear here once your preparer marks them paid.</p>
          </div>
        ) : (
          <div className="dashboard-table">
            <table>
              <thead>
                <tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Issued</th></tr>
              </thead>
              <tbody>
                {paidRows.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.number}</b></td>
                    <td>${r.total}</td>
                    <td className="dashboard-muted">{r.paidAt ? dateOnly(r.paidAt) : "—"}</td>
                    <td className="dashboard-muted">{relative(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-section client-checklist">
        <span className="dashboard-eyebrow">PAYMENT</span>
        <h2>Ways to pay</h2>
        <p className="dashboard-quiet">Honore Tax & Wealth accepts ACH and credit cards. Card payments incur a small processing fee your preparer will confirm before charging.</p>
        <div className="dashboard-cols">
          <div>
            <h3>ACH (preferred)</h3>
            <p className="dashboard-quiet">No processing fee. Routing and account details arrive with every invoice.</p>
          </div>
          <div>
            <h3>Credit card</h3>
            <p className="dashboard-quiet">A 2.9% processing fee applies. Reply to your invoice email to request a card link.</p>
          </div>
        </div>
        <OpenChatButton className="dashboard-button">Ask your preparer about payment <ArrowUpRight size={16} aria-hidden="true" /></OpenChatButton>
      </section>
    </DashboardShell>
  );
}

// Local alias for invoices to keep query site shorter.
const invoice = invoices;