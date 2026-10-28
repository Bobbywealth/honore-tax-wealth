/**
 * 303 "See Other" redirect to an in-app path, for native <form> POST handlers.
 *
 * Do not build the target with `new URL(path, request.url)`: behind Render's
 * proxy the Next server is bound to 0.0.0.0:$PORT, so `request.url` is
 * `https://0.0.0.0:10000/...` and every form submit was redirected to an
 * unreachable host. A relative `Location` is resolved by the browser against
 * the URL it actually requested (RFC 9110 §10.2.2), so it always lands on the
 * public domain and cannot be steered by spoofed forwarding headers.
 */
export function seeOther(path: string): Response {
  // Only same-site absolute paths. Anything else ("//evil.example",
  // "https://…", "javascript:") falls back to the site root.
  const safe = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
  return new Response(null, { status: 303, headers: { Location: safe } });
}
