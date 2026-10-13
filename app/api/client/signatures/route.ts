import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signatures, signableDocuments } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser, requireRole } from "@/lib/auth";
import { primaryClientFor } from "@/lib/access";
import { ESIGN_CONSENT, TEMPLATES } from "@/lib/signature-templates";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signatureSchema = z.object({
  documentId: z.string().uuid(),
  signerName: z.string().trim().min(2).max(160),
  signerEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  signerRole: z.string().trim().min(2).max(60).default("taxpayer"),
  signatureType: z.enum(["drawn", "typed"]),
  // For "drawn" this is a base64 PNG dataURL ("data:image/png;base64,...").
  // For "typed" this is the typed full name (and we render it as a snapshot
  // in the admin view).
  signatureData: z.string().min(20).max(2_000_000), // 2 MB cap on the PNG
  consent: z
    .object({
      agreed: z.literal(true),
      consentText: z.string().min(40),
    })
    .refine((c) => c.consentText === ESIGN_CONSENT, {
      message: "Consent text must be the active ESIGN consent",
    }),
});

const MAX_BODY_BYTES = 4_000_000; // 4 MB cap incl. base64

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Client-side endpoint. Captures a signature against a signable
 * document, recording the ESIGN consent text, IP, and user agent for
 * the audit trail. When the document reaches its `requiredSigners`
 * count, status flips to 'signed' and signed_at is set.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "client" && user.role !== "admin" && user.role !== "staff" && user.role !== "assistant") {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let payload: z.infer<typeof signatureSchema>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const raw = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    payload = signatureSchema.parse(raw);
  } catch (error) {
    logEvent("signatures.create.validation_failed", { user: user.id, err: (error as Error).message });
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  // Clients can only sign their own documents. signableDocuments.clientId
  // is the *client record* id (clients.id), not the user id — resolve it
  // via primaryClientFor. Staff/admin can sign on a client's behalf
  // (e.g. paid preparer block on a 1040).
  if (user.role === "client") {
    const clientId = await primaryClientFor(user);
    if (!clientId) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const [doc] = await getDb()
      .select({ id: signableDocuments.id, status: signableDocuments.status })
      .from(signableDocuments)
      .where(and(eq(signableDocuments.id, payload.documentId), eq(signableDocuments.clientId, clientId)))
      .limit(1);
    if (!doc) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (doc.status !== "pending") {
      return Response.json({ ok: false, error: "document_not_pending" }, { status: 400 });
    }
  } else {
    const doc = await getDb()
      .select({ id: signableDocuments.id, clientId: signableDocuments.clientId, status: signableDocuments.status })
      .from(signableDocuments)
      .where(eq(signableDocuments.id, payload.documentId))
      .limit(1);
    if (doc.length === 0) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (doc[0].status !== "pending") {
      return Response.json({ ok: false, error: "document_not_pending" }, { status: 400 });
    }
  }

  // Pull IP + UA for the audit trail.
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    await ensureMigrated();
    const db = getDb();

    const [sig] = await db.insert(signatures).values({
      documentId: payload.documentId,
      signerId: user.role === "client" ? user.id : null,
      signerName: payload.signerName,
      signerEmail: payload.signerEmail || null,
      signerRole: payload.signerRole,
      signatureType: payload.signatureType,
      signatureData: payload.signatureData,
      consentText: payload.consent.consentText,
      ipAddress,
      userAgent,
    }).returning({ id: signatures.id });

    // Promote the document to 'signed' if we've hit the required
    // signers count and the template allows that many.
    const [doc] = await db
      .select({ id: signableDocuments.id, requiredSigners: signableDocuments.requiredSigners, kind: signableDocuments.kind })
      .from(signableDocuments)
      .where(eq(signableDocuments.id, payload.documentId))
      .limit(1);
    if (doc) {
      const [{ count: signedSoFar }] = await db
        .select({ count: count() })
        .from(signatures)
        .where(eq(signatures.documentId, doc.id));
      const template = TEMPLATES[doc.kind as keyof typeof TEMPLATES];
      const maxAllowed = template ? template.signers.length : doc.requiredSigners;
      const target = Math.min(doc.requiredSigners, maxAllowed);
      if (Number(signedSoFar) >= target) {
        await db
          .update(signableDocuments)
          .set({ status: "signed", signedAt: new Date(), updatedAt: new Date() })
          .where(eq(signableDocuments.id, doc.id));
      }
    }

    logEvent("signatures.create.success", {
      user: user.id,
      documentId: payload.documentId,
      role: payload.signerRole,
      type: payload.signatureType,
      ip: ipAddress,
    });

    revalidatePath(`/dashboard/client/forms/${payload.documentId}`);
    revalidatePath("/dashboard/client");
    revalidatePath(`/dashboard/admin/forms/${payload.documentId}`);
    revalidatePath("/dashboard/admin/forms");
    // Return the persisted signature id so the client can verify the
    // signature was actually saved before showing a success state.
    return Response.json({ ok: true, signatureId: sig?.id ?? null });
  } catch (error) {
    logEvent("signatures.create.db_error", { user: user.id, err: String((error as Error).message) });
    return Response.json({ ok: false, error: "db_error" }, { status: 500 });
  }
}
