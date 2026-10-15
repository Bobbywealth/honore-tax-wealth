import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: read the staff MFA requirement flag. */
export async function GET() {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, mfaRequiredStaff: (await getSetting("mfa_required_staff")) === "1" });
}

const schema = z.object({ mfaRequiredStaff: z.boolean() });

/** Admin-only: require (or stop requiring) MFA for all agents/admins. */
export async function POST(request: Request) {
  const user = await requireRole("admin");
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  await setSetting("mfa_required_staff", payload.mfaRequiredStaff ? "1" : "0");
  await audit(user, "settings.mfa_required_changed", "setting", "mfa_required_staff", {
    value: payload.mfaRequiredStaff,
  });
  return Response.json({ ok: true, mfaRequiredStaff: payload.mfaRequiredStaff });
}
