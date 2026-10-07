import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { consultations } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { sendConsultationEmails } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-memory rate limit: max 5 submissions per IP per 10 minutes.
// Replaced by a Postgres-backed rate limiter in P2-04.
const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = 5;
const MAX_BODY_BYTES = 4000;
const ALLOWED_SERVICES = [
  "Individual tax preparation",
  "Business tax filing",
  "Tax planning",
  "IRS notice help",
  "Not sure yet",
] as const;

function clientIp(request: Request): string {
  const fwd = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = buckets.get(ip) || [];
  const recent = arr.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQ) { buckets.set(ip, recent); return true; }
  recent.push(now); buckets.set(ip, recent);
  return false;
}
// Salted SHA-256 hash of the IP so logs don't carry raw client addresses.
const hashSalt = process.env.LOG_SALT ?? "";
async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${hashSalt}|${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
function logEvent(event: string, fields: Record<string, unknown>) {
  // Single-line JSON, no raw PII (name/email/phone) — only counts and reasons.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

const schema = z.object({
  name: z.string().trim().min(2, "name").max(100, "name"),
  email: z.string().trim().email("email").max(180, "email"),
  phone: z.string().trim().min(7, "phone").max(30, "phone"),
  service: z.enum(ALLOWED_SERVICES, { errorMap: () => ({ message: "service" }) }),
  message: z.string().trim().max(500, "message").optional().default(""),
  website: z.string().optional().default(""), // honeypot — must be empty
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const iph = await ipHash(ip);
  if (rateLimited(ip)) {
    logEvent("consult.rate_limited", { iph });
    return Response.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }
  try {
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY_BYTES) {
      logEvent("consult.body_too_large", { iph, contentLength: len });
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      logEvent("consult.body_too_large", { iph, bodyLength: raw.length });
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      logEvent("consult.bad_json", { iph });
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      const fields = result.error.issues.map(i => i.path.join(".") || "unknown");
      logEvent("consult.validation_failed", { iph, fields });
      return Response.json({ error: "Please check the required fields." }, { status: 400 });
    }
    const { name, email, phone, service, message, website } = result.data;
    if (website && website.length > 0) {
      logEvent("consult.honeypot", { iph });
      return Response.json({ ok: true }); // silent drop
    }
    if (!process.env.DATABASE_URL) {
      logEvent("consult.db_missing", { iph });
      throw Error("Database unavailable");
    }
    await ensureMigrated();

    // Public reference so a visitor can quote their own submission without
    // exposing a sequential id. Uses an unambiguous alphabet (no 0/O/1/I).
    const reference = "HTW-" + randomBytes(5).toString("hex").toUpperCase().slice(0, 8);

    await getDb().insert(consultations).values({
      reference,
      name,
      email,
      phone,
      service,
      message,
      ipHash: iph,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      assignedToId: null,
      contactedAt: null,
    });
    // Note: name/email/phone are NOT included in the log line — they are PII.
    logEvent("consult.created", { iph, service, nameLen: name.length, msgLen: message.length });
    // The lead is durably stored at this point, so email is strictly
    // best-effort: a provider outage must not turn a saved submission into a
    // 5xx for the visitor. sendConsultationEmails never throws.
    const mail = await sendConsultationEmails({ name, email, phone, service, message });
    logEvent(
      "consult.email",
      mail.ok ? { iph, sent: true } : { iph, sent: false, reason: mail.reason },
    );
    // Only returned after the row is committed, so a 201 always means saved.
    return Response.json({ ok: true, reference }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    logEvent("consult.error", { iph, reason: msg });
    return Response.json({ error: "Unable to save the request." }, { status: 503 });
  }
}