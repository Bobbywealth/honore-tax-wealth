/**
 * Single source of truth for converting internal slugs into human-readable
 * labels. The audit called out that snake_case slugs like "tax_prep" and
 * "not_started" were rendering literally in the client and admin views,
 * which leaks implementation detail and reads as broken copy. These helpers
 * normalize anything we know about and fall back to a title-cased version
 * of the raw slug so future stages / service types are readable until a
 * contributor adds them to the maps.
 */

const SERVICE_TYPE_LABELS: Record<string, string> = {
  tax_prep: "Tax preparation",
  tax_planning: "Tax planning",
  tax_filing: "Tax filing",
  business_filing: "Business filing",
  irs_letters: "IRS notice help",
  irs_notices: "IRS notice help",
  bookkeeping: "Bookkeeping",
  payroll: "Payroll",
  advisory: "Advisory",
  individual: "Individual tax preparation",
  business: "Business tax filing",
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  not_started: "Not started",
  docs: "Awaiting documents",
  documents: "Awaiting documents",
  in_prep: "In preparation",
  preparing: "In preparation",
  prep: "In preparation",
  review: "In review",
  client_review: "Client review",
  approval: "Awaiting approval",
  ready: "Ready to file",
  ready_to_file: "Ready to file",
  filing: "Filing",
  filed: "Filed",
  accepted: "Accepted",
  rejected: "Rejected",
  on_hold: "On hold",
  blocked: "Blocked",
  cancelled: "Cancelled",
  complete: "Complete",
  done: "Done",
  in_progress: "In progress",
  open: "Open",
  archived: "Archived",
};

const CLIENT_STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

const ENGAGEMENT_STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  in_preparation: "In preparation",
  in_prep: "In preparation",
  client_review: "Client review",
  ready_to_file: "Ready to file",
  filed: "Filed",
  complete: "Complete",
  on_hold: "On hold",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function titleCase(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function lookup(map: Record<string, string>, key: string | null | undefined, fallback?: string): string {
  if (!key) return fallback ?? "";
  return map[key] ?? titleCase(key);
}

export function formatServiceType(slug: string | null | undefined): string {
  return lookup(SERVICE_TYPE_LABELS, slug, "");
}

export function formatReturnStage(slug: string | null | undefined): string {
  return lookup(STAGE_LABELS, slug, "");
}

export function formatEngagementStatus(slug: string | null | undefined): string {
  return lookup(ENGAGEMENT_STATUS_LABELS, slug, "");
}

export function formatClientStatus(slug: string | null | undefined): string {
  return lookup(CLIENT_STATUS_LABELS, slug, "");
}

export function formatAppointmentStatus(slug: string | null | undefined): string {
  return lookup(APPOINTMENT_STATUS_LABELS, slug, "");
}
