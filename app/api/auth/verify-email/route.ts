import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { consumeEmailVerification } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consumes an email verification token and redirects.
 *
 * A GET link from an email client cannot carry a POST body, so the token is
 * consumed here. The token is single-use, so a reload cannot re-verify.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = token.length >= 20 ? await consumeEmailVerification(token) : false;

  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event: "auth.email_verified", ok }),
  );

  const target = ok ? "/login?verified=1" : "/login?verified=0";
  // Clear any session so the user re-authenticates with a verified account.
  (await cookies()).set("honore_session", "", { path: "/", maxAge: 0 });
  redirect(target);
}