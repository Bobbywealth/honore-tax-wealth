import { headers } from "next/headers";
import { db } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Inquiry = {
  id: number;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  created_at: string;
};

// Interim owner-header gate. Removed in Phase 2 when Better Auth lands.
const OWNER_ID = "8ab18a5e-4d89-4089-b8bb-833ee47c7714";

export default async function Inquiries() {
  const h = await headers();
  if (h.get("oai-authenticated-user-id") !== OWNER_ID) {
    return (
      <main style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h1>Access restricted</h1>
        <p>This page is for the site owner.</p>
        <a href="/">Home</a>
      </main>
    );
  }
  let rows: Inquiry[] = [];
  let error = false;
  try {
    if (process.env.DATABASE_URL) {
      await ensureMigrated();
      const result = await db
        .select({
          id: consultations.id,
          name: consultations.name,
          email: consultations.email,
          phone: consultations.phone,
          service: consultations.service,
          message: consultations.message,
          created_at: consultations.createdAt,
        })
        .from(consultations)
        .orderBy(desc(consultations.id))
        .limit(100);
      rows = result.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
    } else {
      error = true;
    }
  } catch (e) {
    console.error(e);
    error = true;
  }
  return (
    <main style={{ maxWidth: 1050, margin: "50px auto", padding: 24, fontFamily: "sans-serif", color: "#102033" }}>
      <a href="/">← Honoré home</a>
      <h1 style={{ fontFamily: "Georgia", fontSize: 48 }}>Consultation requests</h1>
      {error ? (
        <p>Requests are temporarily unavailable.</p>
      ) : rows.length === 0 ? (
        <p>No requests yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {rows.map((row) => (
            <article key={row.id} style={{ padding: 22, background: "#f2eee5", borderLeft: "4px solid #bd9658" }}>
              <strong>{row.name}</strong> · {row.service}
              <p>
                <a href={`mailto:${row.email}`}>{row.email}</a> · <a href={`tel:${row.phone}`}>{row.phone}</a>
              </p>
              {row.message && <p>{row.message}</p>}
              <small>{row.created_at} UTC</small>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}