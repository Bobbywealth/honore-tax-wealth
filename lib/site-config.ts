/**
 * Public site facts in one place.
 *
 * The practice's street address is not published on the site until the
 * practice supplies a verified one. The 2026-10-14 review asked for either a
 * real address or no address field at all — a visible placeholder
 * ("to be confirmed at launch") is a defect, not a plan. So the address block
 * is rendered only when `mailingAddress` has entries, and is omitted
 * entirely otherwise.
 *
 * To publish the address: fill `mailingAddress` below, one line per line.
 */
export const site = {
  phone: "407-340-7964",
  email: "ihonoretaxwealth@gmail.com",
  /** Business mailing address. Fill in once the practice confirms it. */
  mailingAddress: [] as string[],
  /** Team sign-in. Deliberately a separate entry point from the client portal. */
  agentSignInPath: "/agent",
  /** Client sign-in. */
  clientSignInPath: "/login",
  /** The practice serves clients in every U.S. state. */
  serviceAreaNote: "We serve clients nationwide, in all 50 states.",
};

export function addressLines(): string[] {
  return site.mailingAddress.map((l) => l.trim()).filter((l) => l.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Address row for the static homepage markup. Empty string when unset. */
export function addressRowHtml(): string {
  const lines = addressLines();
  if (lines.length === 0) return "";
  return `<div><dt>Address</dt><dd>${lines.map(escapeHtml).join("<br>")}</dd></div>`;
}
