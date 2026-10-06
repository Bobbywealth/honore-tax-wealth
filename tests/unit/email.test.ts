import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake Resend transport: the suite must never perform a network call.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async (_args: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo: string;
  }) => ({ data: { id: "msg_1" } as { id: string } | null, error: null as { message: string } | null })),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  confirmationHtml,
  escapeHtml,
  mailConfigured,
  notificationHtml,
  notifyAddress,
  sendConsultationEmails,
  type ConsultationLead,
} from "@/lib/email";

const LEAD: ConsultationLead = {
  name: "Dana Rivers",
  email: "dana@example.com",
  phone: "555 010 0100",
  service: "Tax planning",
  message: "Hello",
};

const ENV_KEYS = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CONSULTATION_NOTIFY_EMAIL",
  "ADMIN_EMAIL",
] as const;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  sendMock.mockClear();
  sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("escapeHtml", () => {
  it("escapes the ampersand first so entities are not double-escaped", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes double and single quotes", () => {
    expect(escapeHtml(`"double" and 'single'`)).toBe("&quot;double&quot; and &#39;single&#39;");
  });

  it("escapes an HTML attribute breakout attempt", () => {
    expect(escapeHtml(`" onmouseover="steal()`)).not.toContain(`" onmouseover="`);
  });

  it("leaves ordinary text unchanged", () => {
    expect(escapeHtml("Dana Rivers — 555 010 0100")).toBe("Dana Rivers — 555 010 0100");
  });
});

describe("email HTML builders", () => {
  it("escapes the name, service and phone rendered in the confirmation body", () => {
    // The confirmation deliberately shows only name/service/phone, never the
    // free-text message, so those are the attacker-controlled fields to check.
    const html = confirmationHtml({
      ...LEAD,
      name: "<script>alert(1)</script>",
      service: "<img src=x onerror=alert(1)>",
      phone: `"><script>alert(2)</script>`,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain(`"><script>alert(2)</script>`);
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the attacker-controlled message escaped in the practice notification", () => {
    const html = notificationHtml({ ...LEAD, message: "<b>bold</b>" }, new Date(0));
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("escapes a hostile display name in the notification body", () => {
    const html = notificationHtml({ ...LEAD, name: "<script>alert(1)</script>" }, new Date(0));
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes a hostile email address rather than emitting a raw mailto", () => {
    const html = notificationHtml(
      { ...LEAD, email: `"><script>alert(1)</script>@example.com` },
      new Date(0),
    );
    expect(html).not.toContain(`"><script>`);
  });

  it("renders a placeholder when no message was supplied", () => {
    const html = notificationHtml({ ...LEAD, message: "" }, new Date(0));
    expect(html).toContain("No message was included.");
  });
});

describe("mailConfigured / notifyAddress", () => {
  it("is unconfigured without an API key and sender", () => {
    expect(mailConfigured()).toBe(false);
  });

  it("is unconfigured when only the API key is set", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(mailConfigured()).toBe(false);
  });

  it("is configured when both the API key and sender are set", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Honoré <no-reply@example.com>";
    expect(mailConfigured()).toBe(true);
  });

  it("prefers an explicit consultation notification address", () => {
    process.env.CONSULTATION_NOTIFY_EMAIL = "practice@example.com";
    process.env.ADMIN_EMAIL = "owner@example.com";
    expect(notifyAddress()).toBe("practice@example.com");
  });

  it("ignores a whitespace-only notification address", () => {
    process.env.CONSULTATION_NOTIFY_EMAIL = "   ";
    process.env.ADMIN_EMAIL = "owner@example.com";
    expect(notifyAddress()).toBe("owner@example.com");
  });

  it("falls back to the admin address", () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    expect(notifyAddress()).toBe("owner@example.com");
  });

  it("returns null when neither address is configured", () => {
    expect(notifyAddress()).toBeNull();
  });
});

describe("sendConsultationEmails", () => {
  function configure() {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "no-reply@example.com";
    process.env.CONSULTATION_NOTIFY_EMAIL = "practice@example.com";
  }

  it("reports not_configured and sends nothing when Resend is unset", async () => {
    expect(await sendConsultationEmails(LEAD)).toEqual({ ok: false, reason: "not_configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports not_configured when there is no address to notify", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "no-reply@example.com";
    expect(await sendConsultationEmails(LEAD)).toEqual({ ok: false, reason: "not_configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends a client confirmation and a practice notification", async () => {
    configure();
    expect(await sendConsultationEmails(LEAD)).toEqual({ ok: true, client: true, staff: true });
    expect(sendMock).toHaveBeenCalledTimes(2);

    const [client, practice] = sendMock.mock.calls;
    expect(client![0].to).toBe(LEAD.email);
    expect(client![0].replyTo).toBe("practice@example.com");
    expect(practice![0].to).toBe("practice@example.com");
    expect(practice![0].replyTo).toBe(LEAD.email);
  });

  it("reports send_failed when one leg errors", async () => {
    configure();
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    expect(await sendConsultationEmails(LEAD)).toEqual({ ok: false, reason: "send_failed" });
  });

  it("never throws when the transport rejects", async () => {
    configure();
    sendMock.mockRejectedValue(new Error("network down"));

    await expect(sendConsultationEmails(LEAD)).resolves.toEqual({
      ok: false,
      reason: "send_failed",
    });
  });

  it("redacts an email address out of an error before it is logged", async () => {
    configure();
    sendMock.mockRejectedValue(new Error("rejected for dana@example.com by upstream"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendConsultationEmails(LEAD);

    const logged = log.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).toContain("[email]");
    expect(logged).not.toContain("dana@example.com");
  });
});