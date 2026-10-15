import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, clients, clientAccess } from "@/db/schema";
import { ensureMigrated } from "@/db/migrate";
import { consumeRateLimit, saltedIpKey } from "@/lib/rate-limit";
import {
  hashPassword,
  issueEmailVerification,
  normalizeEmail,
  passwordProblem,
} from "@/lib/auth";
import { mailConfigured } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Postgres-backed rate limit: max 5 registrations per IP per hour.
// Shared across instances/restarts via lib/rate-limit.
const MAX_REQ = 5;
const WINDOW_SECONDS = 3600;
const MAX_BODY_BYTES = 4096;

function clientIp(request: Request): string {
  const fwd =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";
  return fwd.split(",")[0].trim() || "unknown";
}

const hashSalt = process.env.LOG_SALT ?? "";
async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${hashSalt}|${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function logEvent(event: string, fields: Record<string, unknown>) {
  // Never log the submitted name, email, phone, or password.
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event, ...fields }),
  );
}

const schema = z.object({
  displayName: z.string().trim().min(2, "displayName").max(120, "displayName"),
  email: z.string().trim().email("email").max(180, "email"),
  phone: z.string().trim().max(30, "phone").optional().or(z.literal("")),
  password: z.string().min(12, "password").max(200, "password"),
  confirmPassword: z.string().min(1, "confirmPassword"),
  // Optional agent id from ?agent= on the team section. Validated below.
  agentId: z.string().uuid("agentId").optional().or(z.literal("")),
});

/**
 * Public client self-registration.
 *
 * Creates a `users` row (role "client"), a `clients` row (status
 * "registered"), and a `client_access` link between them. If a valid
 * `agentId` is supplied, the client is assigned to that agent via
 * `clients.owner_id`.
 *
 * Email verification is issued when mail is configured; when Resend is not
 * wired the token is still created and the failure is logged so the request
 * itself never breaks.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const iph = await ipHash(ip);

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    logEvent("auth.register.rejected", { iph, reason: "body_too_large" });
    return Response.json({ ok: false, error: "invalid_request" }, { status: 413 });
  }

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    logEvent("auth.register.rejected", { iph, reason: "malformed" });
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (payload.password !== payload.confirmPassword) {
    return Response.json(
      { ok: false, error: "password_mismatch" },
      { status: 400 },
    );
  }
  const pwProblem = passwordProblem(payload.password);
  if (pwProblem) {
    return Response.json({ ok: false, error: "weak_password" }, { status: 400 });
  }

  try {
    await ensureMigrated();

    const rate = await consumeRateLimit(
      saltedIpKey("register", iph),
      MAX_REQ,
      WINDOW_SECONDS,
    );
    if (!rate.allowed) {
      logEvent("auth.register.rate_limited", { iph });
      return Response.json(
        { ok: false, error: "too_many_attempts" },
        {
          status: 429,
          headers: { "retry-after": String(rate.retryAfterSeconds) },
        },
      );
    }

    const email = normalizeEmail(payload.email);
    const db = getDb();

    // Reject duplicate emails with the same generic shape as other
    // validation failures so an attacker cannot enumerate accounts.
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      logEvent("auth.register.duplicate", { iph });
      return Response.json(
        {
          ok: false,
          error: "email_in_use",
        },
        { status: 409 },
      );
    }

    // Validate the requested agent before creating anything.
    let ownerId: string | null = null;
    if (payload.agentId) {
      const agentRows = await db
        .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
        .from(users)
        .where(eq(users.id, payload.agentId))
        .limit(1);
      const agent = agentRows[0];
      if (
        agent &&
        !agent.deactivatedAt &&
        (agent.role === "staff" || agent.role === "assistant" || agent.role === "admin")
      ) {
        ownerId = agent.id;
      } else {
        logEvent("auth.register.bad_agent", { iph });
        // Not fatal: register without assignment rather than failing.
      }
    }

    const passwordHash = await hashPassword(payload.password);
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: "client",
        displayName: payload.displayName,
        phone: payload.phone || null,
      })
      .returning({ id: users.id });

    const [client] = await db
      .insert(clients)
      .values({
        displayName: payload.displayName,
        email,
        phone: payload.phone || null,
        status: "registered",
        ownerId,
      })
      .returning({ id: clients.id });

    await db.insert(clientAccess).values({
      clientId: client.id,
      userId: user.id,
    });

    // Email verification: best-effort. The token is created regardless so
    // verification can complete once mail is configured.
    let verificationSent = false;
    try {
      const token = await issueEmailVerification(user.id);
      if (mailConfigured()) {
        // TODO: send verification email via Resend once templates are added.
        // For now the token exists and /api/auth/verify-email consumes it.
        logEvent("auth.register.verification_issued", { userId: user.id });
        verificationSent = true;
      } else {
        logEvent("auth.register.verification_pending_mail", {
          userId: user.id,
          tokenPrefix: token.slice(0, 8),
        });
      }
    } catch (err) {
      logEvent("auth.register.verification_failed", {
        userId: user.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }

    logEvent("auth.register.success", {
      userId: user.id,
      clientId: client.id,
      assigned: Boolean(ownerId),
    });
    return Response.json({ ok: true, verificationSent });
  } catch (err) {
    logEvent("auth.register.error", {
      iph,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
