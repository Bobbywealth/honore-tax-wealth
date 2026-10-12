import { z } from "zod";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 25_000_000; // 25 MB

const VALID_STATUS = new Set(["prospect", "active", "inactive"]);
const VALID_ENTITY = new Set(["individual", "sole_prop", "llc", "s_corp", "c_corp", "partnership", "trust", "estate", "nonprofit"]);

/**
 * Minimal RFC-4180-ish CSV parser. We can't pull papaparse in here because
 * the project leans on a dependency-light path and only Bobby's team sees
 * this UI. The parser handles:
 *  - quoted fields with embedded commas
 *  - doubled double-quotes ("") inside a quoted field
 *  - CR / LF / CRLF line endings
 *  - a header row whose cells determine column-to-field mapping
 *  - mixed case headers ("Display Name" === "displayName")
 */
function parseCsv(input: string): { header: string[]; rows: string[][] } | { error: string } {
  if (!input || !input.trim()) return { error: "Empty file" };
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") {
      // CRLF or lone CR
      if (text[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  // Final field
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop a trailing fully-empty row
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();
  if (rows.length < 2) return { error: "Need at least a header row and one data row" };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return { header, rows: rows.slice(1) };
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+|_+/g, "");
}

const COL_ALIASES = {
  // display_name
  displayname: "displayName",
  name: "displayName",
  clientname: "displayName",
  client: "displayName",
  // legal_name
  legalname: "legalName",
  companyname: "legalName",
  company: "legalName",
  // email
  email: "email",
  emailaddress: "email",
  // phone
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  // entity_type
  entitytype: "entityType",
  entity: "entityType",
  type: "entityType",
  // status
  status: "status",
  // tax_id_last4
  taxidlast4: "taxIdLast4",
  taxid: "taxIdLast4",
  // address_line1
  addressline1: "addressLine1",
  address1: "addressLine1",
  street: "addressLine1",
  streetaddress: "addressLine1",
  // address_line2
  addressline2: "addressLine2",
  address2: "addressLine2",
  apt: "addressLine2",
  // city
  city: "city",
  // state
  state: "state",
  // postal_code
  postalcode: "postalCode",
  zip: "postalCode",
  zipcode: "postalCode",
  // notes
  notes: "notes",
  note: "notes",
  comments: "notes",
} as const satisfies Record<string, string>;

type ColumnKey = "displayName" | "legalName" | "email" | "phone" | "entityType" | "status" | "taxIdLast4" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "notes";

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/**
 * Bulk-import clients from an uploaded CSV file.
 *
 * Authoritative column map (case-insensitive, spaces/underscores ignored):
 *   Name|display_name|displayname|display name  → displayName (required)
 *   legal_name|company|company_name             → legalName
 *   email|email_address
 *   phone|phone_number|mobile
 *   entity_type|type                           → entityType (one of individual|sole_prop|llc|s_corp|c_corp|partnership|trust|estate|nonprofit)
 *   status                                     → status (prospect|active|inactive, default prospect)
 *   tax_id_last4|taxid                         → taxIdLast4
 *   address|address_1|street|street_address     → addressLine1
 *   address_2|apt                              → addressLine2
 *   city | state | zip|zip_code|postal_code     → address fields
 *   notes|note|comments
 *
 * Returns a structured JSON envelope:
 *   { ok: true, inserted, skipped, errors: [{row, message}] }
 *
 * The native-form browser path uses this end of the route via the
 * clients page's "Import CSV" widget; JSON callers (api.axios) get the
 * same shape.
 */
export async function POST(request: Request) {
  const actor = await requireRole("admin", "staff", "assistant");
  if (!actor) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "database_unavailable" }, { status: 503 });

  const contentType = request.headers.get("content-type") ?? "";
  let filename = "";
  let csvText = "";

  if (contentType.includes("multipart/form-data")) {
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      logEvent("client.import.form_parse_failed", { actor: actor.id, err: String((error as Error).message) });
      return Response.json({ ok: false, error: "form_parse_failed" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "missing_file" }, { status: 400 });
    }
    if (file.size > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "file_too_large" }, { status: 413 });
    }
    filename = file.name ?? "upload.csv";
    if (!/\.(csv|txt)$/i.test(filename)) {
      return Response.json({ ok: false, error: "unsupported_file_type", message: "Save Excel/Sheets as CSV (.csv) and try again." }, { status: 415 });
    }
    csvText = await file.text();
  } else {
    // Plain-text body (paste into a textarea)
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    csvText = await request.text();
  }

  const parsed = parseCsv(csvText);
  if ("error" in parsed) {
    logEvent("client.import.parse_failed", { actor: actor.id, filename, err: parsed.error });
    return Response.json({ ok: false, error: "parse_failed", message: parsed.error }, { status: 400 });
  }

  // Build header → column-key map. Aliases + normKey both win.
  const headerMap: Array<ColumnKey | null> = parsed.header.map((h) => {
    const key = COL_ALIASES[normKey(h) as keyof typeof COL_ALIASES];
    return (key ?? null) as ColumnKey | null;
  });
  const missingRequired = !headerMap.includes("displayName");
  if (missingRequired) {
    return Response.json(
      {
        ok: false,
        error: "missing_required_column",
        message:
          "Need a column named 'Name' (or 'display_name', 'displayName', 'Client') with the client's full name in every row.",
      },
      { status: 400 },
    );
  }

  type RowResult = { row: number; message: string };
  const errors: RowResult[] = [];
  const valuesToInsert: Array<{
    displayName: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    entityType: string;
    status: string;
    taxIdLast4: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    notes: string | null;
    rowIndex: number;
  }> = [];

  let rowNum = 0;
  for (const r of parsed.rows) {
    rowNum++;
    const rec: typeof valuesToInsert[number] = {
      displayName: "",
      legalName: null,
      email: null,
      phone: null,
      entityType: "individual",
      status: "prospect",
      taxIdLast4: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      notes: null,
      rowIndex: rowNum,
    };
    for (let i = 0; i < headerMap.length; i++) {
      const k = headerMap[i];
      if (!k) continue;
      const v = (r[i] ?? "").trim();
      if (!v) continue;
      switch (k) {
        case "displayName":
          rec.displayName = v;
          break;
        case "legalName":
          rec.legalName = v;
          break;
        case "email":
          rec.email = v;
          break;
        case "phone":
          rec.phone = v;
          break;
        case "entityType":
          rec.entityType = VALID_ENTITY.has(v) ? v : "individual";
          if (!VALID_ENTITY.has(v)) errors.push({ row: rowNum, message: `Unknown entity_type '${v}' — defaulted to individual.` });
          break;
        case "status":
          rec.status = VALID_STATUS.has(v) ? v : "prospect";
          if (!VALID_STATUS.has(v)) errors.push({ row: rowNum, message: `Unknown status '${v}' — defaulted to prospect.` });
          break;
        case "taxIdLast4":
          const digits = v.replace(/\D/g, "");
          if (digits.length !== 4) {
            errors.push({ row: rowNum, message: `tax_id_last4 '${v}' must be 4 digits — row skipped if saveable value not possible.` });
            rec.taxIdLast4 = null;
          } else {
            rec.taxIdLast4 = digits;
          }
          break;
        case "addressLine1":
          rec.addressLine1 = v;
          break;
        case "addressLine2":
          rec.addressLine2 = v;
          break;
        case "city":
          rec.city = v;
          break;
        case "state":
          rec.state = v;
          break;
        case "postalCode":
          rec.postalCode = v;
          break;
        case "notes":
          rec.notes = v;
          break;
      }
    }
    if (!rec.displayName) {
      errors.push({ row: rowNum, message: "Missing Name column value" });
      continue;
    }
    if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) {
      errors.push({ row: rowNum, message: `Invalid email '${rec.email}' — row skipped.` });
      continue;
    }
    valuesToInsert.push(rec);
  }

  if (valuesToInsert.length === 0) {
    logEvent("client.import.no_rows", { actor: actor.id, filename, total: parsed.rows.length });
    return Response.json({ ok: false, error: "no_rows", message: "No valid rows to insert.", errors }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const inserted = await db
      .insert(clients)
      .values(
        valuesToInsert.map((v) => {
          const { rowIndex, ...rest } = v;
          return rest;
        }),
      )
      .returning({ id: clients.id });
    logEvent("client.import.success", { actor: actor.id, filename, inserted: inserted.length, errors: errors.length });
    revalidatePath("/dashboard/admin/clients");

    const wantsJson = (request.headers.get("accept") ?? "").includes("application/json") || contentType.includes("application/json");
    if (wantsJson) {
      return Response.json({
        ok: true,
        inserted: inserted.length,
        skipped: parsed.rows.length - inserted.length,
        errors,
      });
    }
    const search = new URLSearchParams({
      imported: String(inserted.length),
      errors: String(errors.length),
      ...(errors.length > 0 ? { report: Buffer.from(JSON.stringify(errors)).toString("base64") } : {}),
    });
    return Response.redirect(new URL(`/dashboard/admin/clients?${search.toString()}`, request.url), 303);
  } catch (error: any) {
    logEvent("client.import.db_error", { actor: actor.id, err: String(error?.message ?? error) });
    return Response.json({ ok: false, error: "db_error", message: String(error?.message ?? error) }, { status: 500 });
  }
}
