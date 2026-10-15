// Signature form templates. Each kind renders as a structured form
// with explicit fields. The body is plain text (HTML allowed for
// emphasis); the renderer in /dashboard/client/forms/[id] keeps the
// form fields in a grid for readability and lines up the signature
// blocks at the bottom. The formData JSONB column stores the parsed
// values the practice pre-fills; the client edits + signs.

export type SignableKind = "form_1040" | "engagement_letter" | "efile_authorization" | "disclosure" | "custom";

export type TemplateField = {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "ssn" | "date" | "checkbox" | "select";
  required?: boolean;
  helper?: string;
  options?: string[]; // for select
  defaultValue?: string;
};

export type Template = {
  kind: SignableKind;
  label: string;
  description: string;
  defaultTitle: (formData: Record<string, string>) => string;
  bodyTemplate: (formData: Record<string, string>, fullName: string) => string;
  fields: TemplateField[];
  // Required signature blocks (taxpayer, spouse, etc.)
  signers: Array<{ role: string; label: string; required: boolean }>;
};

const fmt = (v?: string) => (v ? String(v).trim() : "");

export const TEMPLATES: Record<SignableKind, Template> = {
  form_1040: {
    kind: "form_1040",
    label: "Form 1040 — U.S. Individual Income Tax Return",
    description:
      "The taxpayer signs the official IRS Form 1040 acknowledging the return, the refund/due amount, and the third-party designee.",
    defaultTitle: ({ tax_year }) => `${fmt(tax_year) || new Date().getFullYear()} Form 1040 — ${fmt("filing_status") || "individual return"}`,
    bodyTemplate: (d, fullName) => {
      const lines: string[] = [];
      lines.push(
        `Your ${fmt(d.tax_year) || new Date().getFullYear()} federal income tax return has been prepared on the basis of information you furnished.`,
      );
      if (d.filing_status) lines.push(`Filing status: ${d.filing_status}.`);
      if (d.total_income) lines.push(`Total income (line 9): $${d.total_income}.`);
      if (d.taxable_income) lines.push(`Taxable income (line 15): $${d.taxable_income}.`);
      if (d.total_tax) lines.push(`Total tax (line 24): $${d.total_tax}.`);
      if (d.refund_or_owed) lines.push(d.refund_or_owed);
      lines.push("");
      lines.push("By signing below, you declare under penalties of perjury that the return is true, correct, and complete.");
      return lines.join("\n");
    },
    fields: [
      { key: "tax_year", label: "Tax year", type: "number", required: true, defaultValue: String(new Date().getFullYear() - 1) },
      { key: "filing_status", label: "Filing status", type: "select", required: true, options: ["Single", "Married filing jointly", "Married filing separately", "Head of household", "Qualifying surviving spouse"] },
      { key: "dependents", label: "Dependents", type: "text" },
      { key: "total_income", label: "Total income (line 9)", type: "currency", required: true },
      { key: "adjusted_gross_income", label: "AGI (line 11)", type: "currency" },
      { key: "taxable_income", label: "Taxable income (line 15)", type: "currency", required: true },
      { key: "total_tax", label: "Total tax (line 24)", type: "currency", required: true },
      { key: "withholding", label: "Federal withholding (line 25c)", type: "currency" },
      { key: "refund_or_owed", label: "Refund or amount owed", type: "text", helper: "Plain language — e.g. 'Estimated refund: $1,234' or 'Balance due: $567'" },
      { key: "designee_name", label: "Third-party designee (optional)", type: "text", helper: "Person iHonore Tax authorizes to discuss the return with the IRS." },
    ],
    signers: [
      { role: "taxpayer", label: "Taxpayer signature", required: true },
      { role: "spouse", label: "Spouse signature (if MFJ)", required: false },
      { role: "paid_preparer", label: "Paid preparer signature", required: false },
    ],
  },

  engagement_letter: {
    kind: "engagement_letter",
    label: "Engagement letter",
    description:
      "Confirms the scope of services iHonore Tax will perform, the fee, and the client's authorization to receive communications electronically.",
    defaultTitle: ({ scope }) => `${fmt(scope) || "Engagement"} — iHonore Tax & Wealth`,
    bodyTemplate: (d, fullName) => {
      const lines: string[] = [];
      lines.push(
        `This letter confirms the engagement between iHonore Tax & Wealth ("the firm") and ${fullName || "the undersigned"} ("the client") for the services described below.`,
      );
      if (d.scope) lines.push(`Scope: ${d.scope}`);
      if (d.tax_year) lines.push(`Tax year(s): ${d.tax_year}`);
      if (d.fee) lines.push(`Fee: ${d.fee.startsWith("$") ? d.fee : "$" + d.fee}${d.fee_basis ? " " + d.fee_basis : ""}`);
      if (d.turnaround) lines.push(`Turnaround: ${d.turnaround}`);
      lines.push("");
      lines.push("You authorize iHonore Tax & Wealth to deliver notices, statements, and copies of your tax returns electronically to the email address on file.");
      return lines.join("\n");
    },
    fields: [
      { key: "scope", label: "Scope of services", type: "text", required: true, helper: "e.g. Form 1040 + Schedule C" },
      { key: "tax_year", label: "Tax year(s)", type: "text" },
      { key: "fee", label: "Fee", type: "text", required: true, helper: "Numeric; UI will prefix $ if missing" },
      { key: "fee_basis", label: "Fee basis", type: "select", options: ["flat", "hourly", "contingent", "monthly retainer"] },
      { key: "turnaround", label: "Turnaround", type: "text" },
      { key: "start_date", label: "Engagement start", type: "date" },
    ],
    signers: [{ role: "client", label: "Client signature", required: true }],
  },

  efile_authorization: {
    kind: "efile_authorization",
    label: "IRS e-file authorization (Form 8879)",
    description:
      "IRS Form 8879 authorizes the firm to e-file the taxpayer's return using the taxpayer's prior-year AGI, PIN, or self-select PIN.",
    defaultTitle: ({ tax_year }) => `${fmt(tax_year) || new Date().getFullYear()} e-file signature authorization (Form 8879)`,
    bodyTemplate: (d, fullName) => {
      const lines: string[] = [];
      lines.push(
        `${fullName || "I"}, the taxpayer, declare that I have examined the ${fmt(d.tax_year) || "current"} Form 1040 return and certify it is true, correct, and complete.`,
      );
      lines.push(
        "I authorize iHonore Tax & Wealth to transmit this return by electronic means and to receive acknowledgments from the IRS.",
      );
      if (d.agi_prior_year) lines.push(`Prior-year AGI for PIN verification: $${d.agi_prior_year}.`);
      if (d.pin_signature) lines.push(`5-digit PIN signature: ${d.pin_signature} (signing on line 6b of Form 8879).`);
      return lines.join("\n");
    },
    fields: [
      { key: "tax_year", label: "Tax year", type: "number", required: true },
      { key: "agi_prior_year", label: "Prior-year AGI", type: "currency" },
      { key: "pin_signature", label: "Self-select PIN", type: "text", required: true, helper: "5 digits; becomes your IRS e-file PIN" },
      { key: "filing_method", label: "PIN method", type: "select", options: ["Self-select PIN (current-year first-time filers)", "Prior-year AGI / 5-digit PIN", "PIN from IRS", "No PIN — paper signed"] },
    ],
    signers: [
      { role: "taxpayer", label: "Taxpayer signature (PIN)", required: true },
      { role: "spouse", label: "Spouse signature (PIN if MFJ)", required: false },
    ],
  },

  disclosure: {
    kind: "disclosure",
    label: "Custom disclosure / consent",
    description: "Free-form disclosure or consent document drafted by the firm.",
    defaultTitle: () => "Disclosure & consent",
    bodyTemplate: (d) => (d.body_md || "Replace this body with the disclosure text you want the client to acknowledge."),
    fields: [
      { key: "body_md", label: "Disclosure text", type: "text", required: true, helper: "Plain text. Line breaks render as paragraphs." },
    ],
    signers: [{ role: "client", label: "Client signature", required: true }],
  },

  custom: {
    kind: "custom",
    label: "Custom form",
    description: "Ad-hoc form. Provide a body and capture one or more signatures.",
    defaultTitle: () => "Custom form",
    bodyTemplate: (d) => d.body_md || "(empty body)",
    fields: [
      { key: "body_md", label: "Form body", type: "text", required: true },
    ],
    signers: [{ role: "client", label: "Signature", required: true }],
  },
};

export const KIND_OPTIONS: Array<{ value: SignableKind; label: string }> = Object.entries(TEMPLATES).map(
  ([k, t]) => ({ value: k as SignableKind, label: t.label }),
);

/** ESIGN Act required consent language. Shown above the signature
 * block; the signer must accept before the canvas activates. */
export const ESIGN_CONSENT =
  "By signing below, I agree that my electronic signature is the legal equivalent of my manual signature. " +
  "I consent to do business electronically with iHonore Tax & Wealth, " +
  "I have had the opportunity to review the document in full, and I intend my signature to bind me to the terms above. " +
  "(ESIGN Act, 15 U.S.C. § 7001 et seq.)";
