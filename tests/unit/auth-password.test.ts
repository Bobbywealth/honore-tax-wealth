import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDb, resetFakes } from "../helpers/fake-db";

// lib/auth.ts imports `cookies` at module scope even for the pure password
// helpers. Stub it so these tests never touch the Next.js request runtime.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

// The factory resolves the singleton lazily: `vi.mock` is hoisted above the
// import statements, so referencing a top-level binding here directly would
// hit the temporal dead zone.
vi.mock("@/db", async () => {
  const { fakeDb } = await import("@/tests/helpers/fake-db");
  return {
    getDb: () => fakeDb,
    getPool: () => ({ end: async () => {} }),
  };
});

import { ensureBootstrapAdmin, hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth";

const db = fakeDb;

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  dana@example.com  ")).toBe("dana@example.com");
  });

  it("lowercases the address", () => {
    expect(normalizeEmail("Dana.Rivers@Example.COM")).toBe("dana.rivers@example.com");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail("\t Dana@Example.com \n")).toBe("dana@example.com");
  });

  it("leaves an already-normalized address unchanged", () => {
    expect(normalizeEmail("dana@example.com")).toBe("dana@example.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("  DANA@Example.com  ");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
  });

  it("rejects a password differing only by case", async () => {
    const stored = await hashPassword("Passphrase1");
    expect(await verifyPassword("passphrase1", stored)).toBe(false);
  });

  it("returns false rather than throwing for a malformed stored hash", async () => {
    // Each of these would throw inside the try block if verifyPassword did not
    // guard; the property under test is that it returns false.
    const malformed = [
      "",
      "not-a-hash",
      "plaintext-password",
      "scrypt",
      "scrypt$16384$8$1",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$c2FsdA==",
      "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
      "$$$$$$",
    ];
    for (const stored of malformed) {
      await expect(verifyPassword("anything", stored), stored).resolves.toBe(false);
    }
  });

  it("produces a different hash on every call (random salt)", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);
    expect(a).not.toBe(b);
    // Both still verify against the same password.
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("records the scrypt parameters in the stored hash", async () => {
    const stored = await hashPassword("parameter-shape");
    const [scheme, n, r, p] = stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(n).toBe("16384");
    expect(r).toBe("8");
    expect(p).toBe("1");
  });

  it("never stores the password in the clear", async () => {
    const password = "unique-marker-value-42";
    const stored = await hashPassword(password);
    expect(stored).not.toContain(password);
  });

  describe("NFKC normalization", () => {
    it("accepts a decomposed sequence for a precomposed password", async () => {
      // "e" + COMBINING ACUTE ACCENT folds to "é" under NFKC.
      const stored = await hashPassword("café");
      expect(await verifyPassword("café", stored)).toBe(true);
    });

    it("accepts a precomposed character for a decomposed password", async () => {
      const stored = await hashPassword("café");
      expect(await verifyPassword("café", stored)).toBe(true);
    });

    it("folds full-width characters to their ASCII equivalents", async () => {
      // FULLWIDTH LATIN CAPITAL LETTER A/B fold to "AB" under NFKC.
      const stored = await hashPassword("ＡＢ");
      expect(await verifyPassword("AB", stored)).toBe(true);
    });

    it("still rejects a genuinely different password after normalization", async () => {
      const stored = await hashPassword("café");
      expect(await verifyPassword("cafe", stored)).toBe(false);
    });
  });
});

/**
 * KNOWN DEFECT — reported, not fixed, per the "do not modify application
 * source" constraint for this task.
 *
 * lib/auth.ts:42 computes `actual.length === expected.length &&
 * timingSafeEqual(actual, expected)` but never checks that the decoded key is
 * non-empty. Node's base64 decoder silently skips characters outside the
 * alphabet, so the key segment of `scrypt$16384$8$1$!!!!$!!!!` decodes to an
 * empty buffer; scrypt is then asked for a zero-length key, returns a
 * zero-length buffer, and timingSafeEqual on two empty buffers is true.
 *
 * Net effect: a corrupt or tampered `password_hash` row authenticates ANY
 * password instead of none — authentication fails open on bad data. Reaching
 * it requires write access to the users table, so it is not remotely
 * exploitable on its own, but the fail-open direction is the wrong one.
 *
 * These were `it.fails` while the defect was live. They now assert the correct
 * behaviour as ordinary tests, so a regression that reintroduced the fail-open
 * would fail the suite.
 */
describe("verifyPassword fails closed on an empty decoded key", () => {
  const EMPTY_KEY_HASH = "scrypt$16384$8$1$!!!!$!!!!";

  it("returns false for any password when the stored key segment is undecodable", async () => {
    expect(await verifyPassword("anything", EMPTY_KEY_HASH)).toBe(false);
  });

  it("returns false when the stored key segment is a literal empty string", async () => {
    expect(await verifyPassword("anything", "scrypt$16384$8$1$c2FsdA==$")).toBe(false);
  });

  // Control: a well-formed hash is unaffected, proving the tests above fail
  // for the degenerate-key reason and not because of a broken harness.
  it("still rejects a wrong password against a well-formed hash", async () => {
    const stored = await hashPassword("the-real-password");
    expect(await verifyPassword("not-the-real-password", stored)).toBe(false);
  });
});

describe("ensureBootstrapAdmin password length rule", () => {
  const ENV_KEYS = ["ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;

  beforeEach(() => {
    resetFakes();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("refuses to bootstrap an admin whose password is under 12 characters", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_PASSWORD = "elevenchars"; // 11 characters

    await ensureBootstrapAdmin();

    expect(db.inserts).toHaveLength(0);
  });

  it("bootstraps an admin when the password is at least 12 characters and no users exist", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_PASSWORD = "twelvechars1"; // 13 characters
    db.selectRows = []; // users table is empty

    await ensureBootstrapAdmin();

    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]!.values.role).toBe("admin");
    expect(db.inserts[0]!.values.email).toBe("owner@example.com");
  });

  it("does not create a second admin when a user already exists", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_PASSWORD = "twelvechars1";
    db.selectRows = [{ id: "existing-user" }];

    await ensureBootstrapAdmin();

    expect(db.inserts).toHaveLength(0);
  });

  it("never re-syncs the password or role of an existing owner from the env vars", async () => {
    // Regression: the bootstrap used to re-hash ADMIN_PASSWORD onto the owner
    // row on every login, overwriting any password the owner set in the portal.
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_PASSWORD = "twelvechars1";
    db.selectRows = [{ id: "existing-owner", role: "admin" }];

    await ensureBootstrapAdmin();
    await ensureBootstrapAdmin();

    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("does not touch an existing row even when its role differs from the env role", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ADMIN_PASSWORD = "twelvechars1";
    db.selectRows = [{ id: "existing-user", role: "client" }];

    await ensureBootstrapAdmin();

    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("is a no-op when the admin env vars are unset", async () => {
    await ensureBootstrapAdmin();
    expect(db.inserts).toHaveLength(0);
    expect(db.selectRows).toHaveLength(0);
  });
});