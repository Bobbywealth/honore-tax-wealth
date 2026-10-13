import { NextResponse } from "next/server";
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
    return NextResponse.json({ ok: true, ran: ["ensureBootstrapAdmin", "ensureBootstrapClient"] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
