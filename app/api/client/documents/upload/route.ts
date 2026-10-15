import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientAccess, clients, documents, taxYears } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { storage, sanitizeFilename } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 10 MB cap, matching the documented limit.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CATEGORIES = new Set([
  "identity",
  "income",
  "deductions",
  "prior_return",
  "business",
  "other",
]);

function logEvent(event: string, fields: Record<string, unknown>) {
  // Never log filenames verbatim; they can contain PII.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

const metaSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2100).optional(),
  category: z.string().max(40).optional(),
  requestId: z.string().uuid().optional(),
});

/**
 * Client document upload.
 *
 * Accepts multipart form-data: `file` (required), `taxYear`, `category`,
 * `requestId` (optional — links the upload to an open document request).
 *
 * Files go through the storage abstraction (local disk by default; S3 when
 * configured). They are never web-accessible directly; downloads go through
 * the authenticated download route.
 *
 * NOTE: virus scanning is not yet wired. `scan_status` stays "pending" until
 * a scanner is configured (see lib/storage.ts). Treat uploads as untrusted
 * until then.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "client") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "missing_file" }, { status: 400 });
  }

  let meta: z.infer<typeof metaSchema>;
  try {
    meta = metaSchema.parse({
      taxYear: form.get("taxYear") ?? undefined,
      category: form.get("category") ?? undefined,
      requestId: form.get("requestId") ?? undefined,
    });
  } catch {
    return Response.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ ok: false, error: "unsupported_type" }, { status: 415 });
  }
  const category = meta.category && CATEGORIES.has(meta.category) ? meta.category : "other";

  try {
    await ensureMigrated();
    const db = getDb();

    // Resolve the client's record via client_access (never trust a bare id).
    const accessRows = await db
      .select({ clientId: clientAccess.clientId })
      .from(clientAccess)
      .where(eq(clientAccess.userId, user.id))
      .limit(1);
    const clientId = accessRows[0]?.clientId;
    if (!clientId) {
      return Response.json({ ok: false, error: "no_client_record" }, { status: 403 });
    }

    // Resolve or create the tax year row for grouping.
    let taxYearId: string | null = null;
    if (meta.taxYear) {
      const existing = await db
        .select({ id: taxYears.id })
        .from(taxYears)
        .where(and(eq(taxYears.clientId, clientId), eq(taxYears.year, meta.taxYear)))
        .limit(1);
      if (existing[0]) {
        taxYearId = existing[0].id;
      } else {
        const [created] = await db
          .insert(taxYears)
          .values({ clientId, year: meta.taxYear })
          .returning({ id: taxYears.id });
        taxYearId = created.id;
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Re-check size after buffering (defense in depth against lying headers).
    if (bytes.length > MAX_BYTES) {
      return Response.json({ ok: false, error: "file_too_large" }, { status: 413 });
    }

    const originalFilename = file.name.slice(0, 255);
    const { key, checksum } = await storage().put(
      `clients/${clientId}`,
      originalFilename,
      bytes,
      file.type,
    );

    const [doc] = await db
      .insert(documents)
      .values({
        clientId,
        taxYearId,
        storageKey: key,
        originalFilename,
        sanitizedFilename: sanitizeFilename(originalFilename),
        contentType: file.type,
        sizeBytes: bytes.length,
        checksum,
        category,
        reviewStatus: "pending",
        // Stays "pending" until a virus scanner is configured.
        scanStatus: "pending",
        uploadedById: user.id,
      })
      .returning({ id: documents.id });

    logEvent("document.upload.success", {
      userId: user.id,
      clientId,
      docId: doc.id,
      sizeBytes: bytes.length,
      category,
    });
    revalidatePath("/dashboard/client/documents");
    return Response.json({ ok: true, id: doc.id });
  } catch (err) {
    logEvent("document.upload.error", {
      userId: user.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
