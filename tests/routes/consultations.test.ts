import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDb, resetFakes, validConsultation } from "../helpers/fake-db";

// `vi.hoisted` so the mock factory can close over the spy.
const { sendConsultationEmails } = vi.hoisted(() => ({
  sendConsultationEmails: vi.fn(async () => ({ ok: true as const, client: true, staff: true })),
}));

vi.mock("@/db", async () => {
  const { fakeDb } = await import("@/tests/helpers/fake-db");
  return {
    getDb: () => fakeDb,
    getPool: () => ({ end: async () => {} }),
  };
});

vi.mock("@/db/migrate", () => ({
  ensureMigrated: async () => {},
  close: async () => {},
}));

// Real Resend calls are never permitted from the test suite.
vi.mock("@/lib/email", () => ({ sendConsultationEmails }));

import { POST } from "@/app/api/consultations/route";

const ALLOWED_SERVICES = [
  "Individual tax preparation",
  "Business tax filing",
  "Tax planning",
  "IRS notice help",
  "Not sure yet",
];

function consult(
  body: unknown,
  { ip, contentLength }: { ip: string; contentLength?: number } = { ip: "203.0.113.1" },
): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": ip,
  });
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return new Request("http://localhost/api/consultations", {
    method: "POST",
    headers,
    body: raw,
  });
}

beforeEach(() => {
  resetFakes();
  // The route requires DATABASE_URL to be present before it will insert.
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/honore");
  sendConsultationEmails.mockClear();
  sendConsultationEmails.mockResolvedValue({ ok: true, client: true, staff: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/consultations — body size cap", () => {
  it("returns 413 when the declared content-length exceeds 4000 bytes", async () => {
    // A small real body with an oversized declared length: the header guard
    // must reject before any parsing or database work.
    const res = await POST(consult(validConsultation(), { ip: "203.0.113.2", contentLength: 5000 }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Request too large" });
    expect(fakeDb.inserts).toHaveLength(0);
    expect(sendConsultationEmails).not.toHaveBeenCalled();
  });

  it("returns 413 when the actual body exceeds 4000 bytes", async () => {
    // No spoofable header here — the real byte count is over the cap.
    const res = await POST(
      consult(validConsultation({ message: "x".repeat(5000) }), { ip: "203.0.113.3" }),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Request too large" });
    expect(fakeDb.inserts).toHaveLength(0);
  });

  it("accepts a body just under the cap", async () => {
    const res = await POST(
      consult(validConsultation({ message: "x".repeat(300) }), { ip: "203.0.113.4" }),
    );
    expect(res.status).toBe(201);
    expect(fakeDb.inserts).toHaveLength(1);
  });
});

describe("POST /api/consultations — validation", () => {
  it("returns 400 for an unrecognised service", async () => {
    const res = await POST(
      consult(validConsultation({ service: "Cryptocurrency forensics" }), { ip: "203.0.113.5" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Please check the required fields." });
    expect(fakeDb.inserts).toHaveLength(0);
  });

  it.each(ALLOWED_SERVICES)("accepts the allowed service %j", async (service) => {
    const res = await POST(consult(validConsultation({ service }), { ip: "203.0.113.6" }));
    expect(res.status).toBe(201);
    expect(fakeDb.inserts[0]!.values.service).toBe(service);
  });

  it("returns 400 for a malformed email address", async () => {
    const res = await POST(
      consult(validConsultation({ email: "not-an-email" }), { ip: "203.0.113.7" }),
    );
    expect(res.status).toBe(400);
    expect(fakeDb.inserts).toHaveLength(0);
  });

  it("returns 400 for a too-short name", async () => {
    const res = await POST(consult(validConsultation({ name: "D" }), { ip: "203.0.113.8" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a too-short phone number", async () => {
    const res = await POST(consult(validConsultation({ phone: "123" }), { ip: "203.0.113.9" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(consult("{ this is not json", { ip: "203.0.113.10" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body." });
    expect(fakeDb.inserts).toHaveLength(0);
  });

  it("defaults an omitted message to an empty string", async () => {
    const payload = validConsultation();
    delete (payload as Record<string, unknown>).message;

    const res = await POST(consult(payload, { ip: "203.0.113.11" }));
    expect(res.status).toBe(201);
    expect(fakeDb.inserts[0]!.values.message).toBe("");
  });
});

describe("POST /api/consultations — honeypot", () => {
  it("silently succeeds without inserting when the hidden field is filled", async () => {
    const res = await POST(
      consult(validConsultation({ website: "http://spam.example.com" }), { ip: "203.0.113.12" }),
    );

    // A bot that fills the honeypot sees a plain acknowledgement. It is not
    // told the submission was dropped, and it gains no reference to quote.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fakeDb.inserts).toHaveLength(0);
    expect(sendConsultationEmails).not.toHaveBeenCalled();
  });

  it("does not store or acknowledge a honeypot submission as if it were real", async () => {
    const bot = await POST(
      consult(validConsultation({ website: "spam" }), { ip: "203.0.113.13" }),
    );
    const human = await POST(consult(validConsultation(), { ip: "203.0.113.14" }));

    // Neither path reports an error, so a bot learns nothing from the status
    // code alone. What it cannot get is a reference: that is only issued once a
    // row is committed, which is what makes "201 means saved" trustworthy.
    expect(bot.status).toBe(200);
    expect(human.status).toBe(201);
    expect((await bot.json()).reference).toBeUndefined();
    expect((await human.json()).reference).toMatch(/^HTW-[0-9A-F]{8}$/);

    // Exactly one insert, for the genuine submission.
    expect(fakeDb.inserts).toHaveLength(1);
  });

  it("inserts when the honeypot field is present but empty", async () => {
    const res = await POST(consult(validConsultation({ website: "" }), { ip: "203.0.113.15" }));
    expect(res.status).toBe(201);
    expect(fakeDb.inserts).toHaveLength(1);
  });

  it("validates before honouring the honeypot, so malformed spam is still a 400", async () => {
    const res = await POST(
      consult(validConsultation({ website: "spam", email: "bad" }), { ip: "203.0.113.16" }),
    );
    expect(res.status).toBe(400);
    expect(fakeDb.inserts).toHaveLength(0);
  });
});

describe("POST /api/consultations — happy path", () => {
  it("returns 201 and inserts the submission exactly once", async () => {
    const payload = validConsultation();

    const res = await POST(consult(payload, { ip: "203.0.113.17" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      reference: expect.stringMatching(/^HTW-[0-9A-F]{8}$/),
    });
    expect(fakeDb.inserts).toHaveLength(1);
    expect(fakeDb.inserts[0]!.values).toMatchObject({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      service: payload.service,
      message: payload.message,
    });
  });

  it("does not persist the honeypot field to the database", async () => {
    await POST(consult(validConsultation(), { ip: "203.0.113.18" }));
    expect(fakeDb.inserts[0]!.values).not.toHaveProperty("website");
  });

  it("sends the consultation email for a stored submission", async () => {
    await POST(consult(validConsultation(), { ip: "203.0.113.19" }));
    expect(sendConsultationEmails).toHaveBeenCalledTimes(1);
  });

  it("still returns 201 when the email provider fails", async () => {
    // The lead is already durably stored at this point, so a Resend outage
    // must not turn a saved submission into a 5xx.
    sendConsultationEmails.mockResolvedValue({ ok: false, reason: "send_failed" } as never);

    const res = await POST(consult(validConsultation(), { ip: "203.0.113.20" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      reference: expect.stringMatching(/^HTW-[0-9A-F]{8}$/),
    });
    expect(fakeDb.inserts).toHaveLength(1);
  });
});

describe("POST /api/consultations — failure modes", () => {
  it("returns 503 when DATABASE_URL is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const res = await POST(consult(validConsultation(), { ip: "203.0.113.21" }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Unable to save the request." });
    expect(fakeDb.inserts).toHaveLength(0);
  });

  it("returns 503 and sends no email when the insert fails", async () => {
    fakeDb.failWith = new Error("deadlock detected");

    const res = await POST(consult(validConsultation(), { ip: "203.0.113.22" }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Unable to save the request." });
    expect(sendConsultationEmails).not.toHaveBeenCalled();
  });

  it("does not leak driver error text to the caller", async () => {
    fakeDb.failWith = new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");

    const res = await POST(consult(validConsultation(), { ip: "203.0.113.23" }));
    const body = await res.text();

    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("10.0.0.5");
  });
});

describe("POST /api/consultations — rate limiting", () => {
  it("returns 429 on the sixth submission from one IP", async () => {
    const ip = "203.0.113.30";

    for (let i = 0; i < 5; i++) {
      const res = await POST(consult(validConsultation(), { ip }));
      expect(res.status, `submission ${i + 1}`).toBe(201);
    }

    const limited = await POST(consult(validConsultation(), { ip }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many requests. Please try again in a few minutes.",
    });
    expect(fakeDb.inserts).toHaveLength(5);
  });

  it("does not rate-limit a different IP", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(consult(validConsultation(), { ip: "203.0.113.31" }));
    }
    const other = await POST(consult(validConsultation(), { ip: "203.0.113.32" }));
    expect(other.status).toBe(201);
  });

  it("counts a honeypot submission against the IP budget", async () => {
    const ip = "203.0.113.33";
    for (let i = 0; i < 5; i++) {
      await POST(consult(validConsultation({ website: "spam" }), { ip }));
    }
    const limited = await POST(consult(validConsultation(), { ip }));
    expect(limited.status).toBe(429);
  });

  it("takes only the first entry of an X-Forwarded-For chain", async () => {
    // 5 submissions attributed to the leading address of the chain.
    const chainIp = "203.0.113.34";
    const header = `${chainIp}, 70.41.3.18, 150.172.238.178`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        new Request("http://localhost/api/consultations", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": header },
          body: JSON.stringify(validConsultation()),
        }),
      );
      expect(res.status).toBe(201);
    }
    const limited = await POST(
      new Request("http://localhost/api/consultations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": header },
        body: JSON.stringify(validConsultation()),
      }),
    );
    expect(limited.status).toBe(429);
  });
});