import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { hashPassword, requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Roles the team page exposes. `staff` covers the existing "agent" role
 * already in the schema; `assistant` is the new non-tax-prep staff type
 * Bobby asked for.
 */
const ROLES = ["staff", "assistant", "admin"] as const;

const schema = z.object({
  email: z.string().trim().email().max(180),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
});

const MAX_BODY_BYTES = 4_000;

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Add a staff account. Only an admin may create new staff accounts.
 *
 * The created user is assigned a 24-character temporary password. Email
 * delivery is intentionally out of scope: when transactional email is
 * wired up, the temp password + reset link should go to `payload.email`.
 * For now, the response carries the temp password so the admin can hand
 * it off manually (the team page UI surfaces it on success).
 */
export async function POST(request: Request) {
  const actor = await requireRole("admin");
  if (!actor) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let payload: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("team.invite.validation_failed", { actor: actor.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const tempPassword = randomBytes(18).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  try {
    await ensureMigrated();
    const [row] = await getDb()
      .insert(users)
      .values({
        email: payload.email.toLowerCase(),
        displayName: payload.displayName,
        role: payload.role,
        passwordHash,
      })
      .returning({ id: users.id });
    logEvent("team.invite.success", { actor: actor.id, newUserId: row?.id, role: payload.role });

    if (!contentType.includes("application/json")) {
      revalidatePath("/dashboard/admin/team");
      return seeOther(`/dashboard/admin/team?created=${row?.id}`);
    }

    revalidatePath("/dashboard/admin/team");
    return Response.json({ ok: true, id: row?.id, tempPassword, role: payload.role });
  } catch (error: any) {
    const code = error?.code ?? error?.cause?.code ?? "";
    if (code === "23505" || /unique constraint/i.test(String(error?.message ?? ""))) {
      return Response.json({ ok: false, error: "email_already_exists" }, { status: 409 });
    }
    logEvent("team.invite.db_error", { actor: actor.id, err: String(error?.message ?? error) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
