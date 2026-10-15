import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCookies, fakeDb, resetFakes } from "../helpers/fake-db";

vi.mock("next/headers", async () => {
  const { fakeCookies } = await import("@/tests/helpers/fake-db");
  return {
    cookies: async () => fakeCookies,
    headers: async () => new Headers(),
  };
});

vi.mock("@/db", async () => {
  const { fakeDb } = await import("@/tests/helpers/fake-db");
  return {
    getDb: () => fakeDb,
    getPool: () => ({ end: async () => {} }),
  };
});

// Migrations are a deployment concern; stub them so route tests assert route
// behaviour and never touch SQL.
vi.mock("@/db/migrate", () => ({
  ensureMigrated: async () => {},
  close: async () => {},
}));

// Rate limiting is a shared Postgres concern now. Mock it so these tests
// assert login behaviour rather than re-testing the limiter (which has its own
// unit coverage), and so the 429 path is controllable.
// A faithful fake of the shared limiter: counts per key, so per-caller
// isolation and the 429 threshold are both exercised the way the real
// Postgres-backed limiter behaves.
const rateState = { counts: new Map<string, number>(), limit: 8 };
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: async (key: string) => {
    const next = (rateState.counts.get(key) ?? 0) + 1;
    rateState.counts.set(key, next);
    const allowed = next <= rateState.limit;
    return {
      allowed,
      remaining: Math.max(0, rateState.limit - next),
      retryAfterSeconds: allowed ? 0 : 60,
    };
  },
  peekRateLimit: async () => ({ allowed: true, remaining: 7, retryAfterSeconds: 0 }),
  resetRateLimit: async (key: string) => {
    rateState.counts.delete(key);
  },
  sweepRateLimits: async () => 0,
  saltedIpKey: (scope: string, key: string) => `${scope}:${key}`,
}));

import { POST } from "@/app/api/auth/login/route";
import { SESSION_COOKIE } from "@/lib/auth";

const EXISTING_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "dana@example.com",
  passwordHash: "",
  role: "client",
};

/** A real scrypt hash, built once, so the happy path does genuine work. */
let realHash: string;

beforeAll(async () => {
  const { hashPassword } = await import("@/lib/auth");
  realHash = await hashPassword("correct-horse-battery-staple");
});

beforeEach(() => {
  resetFakes();
  rateState.counts.clear();
  // The route logs a single-line JSON event per outcome; silence it so test
  // output stays readable. Assertions never depend on these calls.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

function login(body: unknown, ip: string): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: raw,
  });
}

describe("POST /api/auth/login — anti-enumeration", () => {
  it("returns 401 invalid_credentials for an unknown account", async () => {
    fakeDb.selectRows = [];
    const res = await POST(login({ email: "nobody@example.com", password: "whatever123" }, "198.51.100.1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("returns 401 invalid_credentials for a known account with a wrong password", async () => {
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];
    const res = await POST(login({ email: "dana@example.com", password: "wrong-password" }, "198.51.100.2"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("returns a byte-identical response for an unknown account and a wrong password", async () => {
    fakeDb.selectRows = [];
    const unknown = await POST(
      login({ email: "nobody@example.com", password: "whatever123" }, "198.51.100.3"),
    );
    const unknownBody = await unknown.text();
    const unknownHeaders = Object.fromEntries(unknown.headers.entries());

    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];
    const wrong = await POST(
      login({ email: "dana@example.com", password: "wrong-password" }, "198.51.100.4"),
    );
    const wrongBody = await wrong.text();
    const wrongHeaders = Object.fromEntries(wrong.headers.entries());

    // The whole point of the anti-enumeration property: an attacker must not be
    // able to tell "no such user" from "wrong password" by diffing the reply.
    expect(unknown.status).toBe(wrong.status);
    expect(unknownBody).toBe(wrongBody);
    expect(unknownBody).toBe(JSON.stringify({ ok: false, error: "invalid_credentials" }));
    expect(unknownHeaders["content-type"]).toBe(wrongHeaders["content-type"]);
  });

  it("does not reveal whether the account exists in the response for a correct-password-less account", async () => {
    // An account row with an empty password_hash must still be indistinguishable.
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: "" }];
    const res = await POST(login({ email: "dana@example.com", password: "anything" }, "198.51.100.5"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_credentials" });
  });
});

describe("POST /api/auth/login — rate limiting", () => {
  it("returns 429 once an IP exceeds the failure budget", async () => {
    fakeDb.selectRows = []; // unknown account => every attempt fails

    // MAX_FAIL is 8: the first 8 attempts are served, the 9th is refused.
    for (let i = 0; i < 8; i++) {
      const res = await POST(
        login({ email: "nobody@example.com", password: "guess" }, "198.51.100.10"),
      );
      expect(res.status, `attempt ${i + 1}`).toBe(401);
    }

    const limited = await POST(
      login({ email: "nobody@example.com", password: "guess" }, "198.51.100.10"),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: "too_many_attempts" });
  });

  it("does not rate-limit a different IP behind the same attempt", async () => {
    fakeDb.selectRows = [];
    // Exhaust one caller's budget...
    for (let i = 0; i < rateState.limit; i++) {
      await POST(login({ email: "nobody@example.com", password: "guess" }, "198.51.100.11"));
    }
    const limited = await POST(
      login({ email: "nobody@example.com", password: "guess" }, "198.51.100.11"),
    );
    expect(limited.status).toBe(429);

    // ...a different caller must still be served, because the shared limiter
    // keys by salted IP hash rather than counting globally.
    const other = await POST(
      login({ email: "nobody@example.com", password: "guess" }, "198.51.100.12"),
    );
    expect(other.status).toBe(401);
  });

  it("still returns 429 for a correct password once the caller is limited", async () => {
    // Burn the budget with wrong passwords, then present the right one. A
    // limited caller must not be let in even when the password is correct.
    fakeDb.selectRows = [];
    for (let i = 0; i < rateState.limit; i++) {
      await POST(login({ email: "dana@example.com", password: "wrong-guess" }, "198.51.100.13"));
    }
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];
    const res = await POST(
      login({ email: "dana@example.com", password: "correct-horse-battery-staple" }, "198.51.100.13"),
    );
    expect(res.status).toBe(429);
    // A correct password must not create a session while the caller is limited.
    expect(fakeDb.inserts).toHaveLength(0);
  });
});

describe("POST /api/auth/login — happy path", () => {
  it("issues a session, sets the cookie, and returns the role", async () => {
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];

    const res = await POST(
      login({ email: "dana@example.com", password: "correct-horse-battery-staple" }, "198.51.100.20"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: "client", mfaEnrollmentRequired: false });
    expect(fakeDb.inserts).toHaveLength(1);
    expect(fakeCookies.setCalls).toHaveLength(1);
    const cookie = fakeCookies.setCalls[0]!;
    expect(cookie.name).toBe(SESSION_COOKIE);
    expect(cookie.options?.httpOnly).toBe(true);
    expect(cookie.options?.path).toBe("/");
  });

  it("matches the account case-insensitively via normalizeEmail", async () => {
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];
    const res = await POST(
      login({ email: "  DANA@Example.COM  ", password: "correct-horse-battery-staple" }, "198.51.100.21"),
    );
    expect(res.status).toBe(200);
  });

  it("clears the failure bucket after a successful login", async () => {
    const ip = "198.51.100.22";
    fakeDb.selectRows = [];
    for (let i = 0; i < 7; i++) {
      await POST(login({ email: "nobody@example.com", password: "guess" }, ip));
    }
    fakeDb.selectRows = [{ ...EXISTING_USER, passwordHash: realHash }];
    const success = await POST(
      login({ email: "dana@example.com", password: "correct-horse-battery-staple" }, ip),
    );
    expect(success.status).toBe(200);

    // The bucket was reset, so a further failure is served, not locked out.
    fakeDb.selectRows = [];
    const after = await POST(login({ email: "nobody@example.com", password: "guess" }, ip));
    expect(after.status).toBe(401);
  });
});

describe("POST /api/auth/login — input rejection", () => {
  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(login("{not json", "198.51.100.30"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("returns 400 for a non-email address", async () => {
    const res = await POST(login({ email: "not-an-email", password: "whatever" }, "198.51.100.31"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty password", async () => {
    const res = await POST(login({ email: "dana@example.com", password: "" }, "198.51.100.32"));
    expect(res.status).toBe(400);
  });

  it("returns 413 for a body over 2048 bytes", async () => {
    const res = await POST(
      login({ email: "dana@example.com", password: "x".repeat(3000) }, "198.51.100.33"),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_credentials" });
    expect(fakeDb.selectRows).toHaveLength(0);
  });

  it("returns 500 and no session when the database layer throws", async () => {
    fakeDb.failWith = new Error("connection refused");
    const res = await POST(login({ email: "dana@example.com", password: "whatever" }, "198.51.100.34"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "server_error" });
    expect(fakeCookies.setCalls).toHaveLength(0);
  });
});