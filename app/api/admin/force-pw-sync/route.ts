import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureBootstrapAdmin, ensureBootstrapClient } from "@/lib/auth";
import { ensureMigrated } from "@/db/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = request.headers.get("x-force-secret") ?? "";
  if (secret !== (process.env.FORCE_PW_SYNC_SECRET ?? "honore-2026-10-13-once")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    await ensureMigrated();
    await ensureBootstrapAdmin();
    await ensureBootstrapClient();

    // After self-heal, dump current user state for debugging.
    const db = getDb();
    const adminRow = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        hashLen: users.passwordHash,
        deactivatedAt: users.deactivatedAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.email, "owner@honoretaxandwealth.com"))
      .limit(1);
    const clientRow = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        hashLen: users.passwordHash,
        deactivatedAt: users.deactivatedAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.email, "client@honoretaxwealth.com"))
      .limit(1);

    return NextResponse.json({
      ok: true,
      ran: ["ensureBootstrapAdmin", "ensureBootstrapClient"],
      admin: adminRow[0] ?? null,
      client: clientRow[0] ?? null,
      hashSample: adminRow[0]?.passwordHash?.slice(0, 30),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
