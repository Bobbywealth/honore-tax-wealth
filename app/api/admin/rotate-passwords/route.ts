import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole, hashPassword, normalizeEmail } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await requireRole("admin");
  if (!actor) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }
  const adminPw = process.env.ADMIN_PASSWORD;
  const clientPw = process.env.CLIENT_PASSWORD;
  if (!adminPw || !clientPw) {
    return NextResponse.json(
      { ok: false, error: "missing_env", message: "ADMIN_PASSWORD and CLIENT_PASSWORD must both be set." },
      { status: 400 },
    );
  }
  try {
    await ensureMigrated();
    const db = getDb();
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? "owner@honoretaxwealth.com");
    const clientEmail = normalizeEmail(process.env.CLIENT_EMAIL ?? "client@honoretaxwealth.com");
    const adminHash = await hashPassword(adminPw);
    const clientHash = await hashPassword(clientPw);
    const adminResult = await db.update(users).set({ passwordHash: adminHash, updatedAt: new Date() }).where(eq(users.email, adminEmail)).returning({ id: users.id });
    const clientResult = await db.update(users).set({ passwordHash: clientHash, updatedAt: new Date() }).where(eq(users.email, clientEmail)).returning({ id: users.id });
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "admin.password_rotation.executed", actor: actor.id, adminId: adminResult[0]?.id ?? null, clientId: clientResult[0]?.id ?? null }));
    return NextResponse.json({ ok: true, adminId: adminResult[0]?.id ?? null, clientId: clientResult[0]?.id ?? null });
  } catch (err) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "admin.password_rotation.failed", actor: actor.id, reason: err instanceof Error ? err.message : "unknown" }));
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
