import { z } from "zod";
import { consumePasswordReset, passwordProblem } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

const schema = z.object({
  token: z.string().min(20, "token").max(200, "token"),
  password: z.string().min(1, "password").max(200, "password"),
});

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  // Brute-force limit on token guessing, per token value.
  const limit = await consumeRateLimit(`pwreset-try:${parsed.token.slice(0, 40)}`, 10, 900);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "too_many_attempts" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const problem = passwordProblem(parsed.password);
  if (problem) {
    return Response.json({ ok: false, error: "weak_password", message: problem }, { status: 400 });
  }

  try {
    const ok = await consumePasswordReset(parsed.token, parsed.password);
    // Same response either way, so a valid-but-expired token is
    // indistinguishable from a guessed one.
    if (!ok) {
      return Response.json(
        { ok: false, error: "invalid_token", message: "This reset link is invalid or has expired." },
        { status: 400 },
      );
    }
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), event: "auth.password_reset_completed" }),
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "auth.reset_consume_error",
        reason: err instanceof Error ? err.name : "unknown",
      }),
    );
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}