import { z } from "zod";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seeOther } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000;

const schema = z.object({
  displayName: z.string().trim().min(2, "displayName").max(120, "displayName"),
  email: z.string().trim().email("email").max(180, "email").optional().or(z.literal("")),
  phone: z.string().trim().max(30, "phone").optional().or(z.literal("")),
  status: z.enum(["prospect", "active"]).optional().default("prospect"),
});

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Admin "Add client" — manual client creation (the alternative to CSV
 * import). Accepts form-urlencoded (native form POST, redirects back) or
 * JSON (returns { ok: true, id }).
 */
export async function POST(request: Request) {
  const user = await requireRole("admin", "staff", "assistant");
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let payload: z.infer<typeof schema>;
  try {
    const raw = isJson
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = schema.parse(raw);
  } catch (error) {
    logEvent("client.create.validation_failed", { userId: user.id, err: (error as Error).message });
    if (!isJson) {
      return seeOther("/dashboard/admin/clients?new=1&error=invalid");
    }
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const [row] = await getDb()
      .insert(clients)
      .values({
        displayName: payload.displayName,
        email: payload.email || null,
        phone: payload.phone || null,
        status: payload.status,
      })
      .returning({ id: clients.id });
    logEvent("client.create.success", { userId: user.id, clientId: row?.id });
    revalidatePath("/dashboard/admin/clients");
    if (!isJson) {
      return seeOther("/dashboard/admin/clients?created=1");
    }
    return Response.json({ ok: true, id: row?.id });
  } catch (error) {
    logEvent("client.create.db_error", { userId: user.id, err: (error as Error).message });
    if (!isJson) {
      return seeOther("/dashboard/admin/clients?new=1&error=db");
    }
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
