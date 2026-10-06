import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCookies, fakeDb, resetFakes } from "../helpers/fake-db";

vi.mock("next/headers", async () => {
  const { fakeCookies } = await import("@/tests/helpers/fake-db");
  return { cookies: async () => fakeCookies };
});

vi.mock("@/db", async () => {
  const { fakeDb } = await import("@/tests/helpers/fake-db");
  return {
    getDb: () => fakeDb,
    getPool: () => ({ end: async () => {} }),
  };
});

import { SESSION_COOKIE, currentUser, requireRole } from "@/lib/auth";

const STAFF_SESSION = "staff-session-token";
const CLIENT_SESSION = "client-session-token";
const ADMIN_SESSION = "admin-session-token";

function userRow(id: string, email: string, role: string, displayName: string | null = null) {
  return { expiresAt: new Date("2099-01-01T00:00:00Z"), id, email, role, displayName };
}

beforeEach(() => {
  resetFakes();
  fakeCookies.entries.set(SESSION_COOKIE, CLIENT_SESSION);
  fakeDb.selectRows = [userRow("11111111-1111-1111-1111-111111111111", "client@example.com", "client", "Casey Client")];
});

describe("currentUser", () => {
  it("returns null when no session cookie is present", async () => {
    fakeCookies.reset();
    expect(await currentUser()).toBeNull();
  });

  it("returns null for an empty session cookie value", async () => {
    fakeCookies.entries.set(SESSION_COOKIE, "");
    expect(await currentUser()).toBeNull();
  });

  it("returns null when the token matches no session row (expired or revoked)", async () => {
    fakeDb.selectRows = [];
    expect(await currentUser()).toBeNull();
  });

  it("returns the identity for a valid session", async () => {
    expect(await currentUser()).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "client@example.com",
      role: "client",
      displayName: "Casey Client",
    });
  });

  it("does not resolve an identity from anything other than the session cookie", async () => {
    // lib/auth.ts documents that the earlier gate trusted a spoofable
    // `oai-authenticated-user-id` request header. There is no header-reading
    // code path in this module at all, so an absent cookie stays anonymous
    // regardless of what a caller might have sent on the wire.
    fakeCookies.reset();
    const request = new Request("http://localhost/dashboard", {
      headers: { "oai-authenticated-user-id": "11111111-1111-1111-1111-111111111111" },
    });
    await request.text().catch(() => {});
    expect(await currentUser()).toBeNull();
  });
});

describe("requireRole", () => {
  it("returns null for an anonymous caller even when the role is unrestricted", async () => {
    fakeCookies.reset();
    fakeDb.selectRows = [];
    expect(await requireRole()).toBeNull();
  });

  it("returns null when the session no longer resolves", async () => {
    fakeDb.selectRows = [];
    expect(await requireRole("client")).toBeNull();
  });

  describe("a client-role user", () => {
    beforeEach(() => {
      fakeDb.selectRows = [userRow("11111111-1111-1111-1111-111111111111", "client@example.com", "client", "Casey Client")];
    });

    it("is admitted to the client gate", async () => {
      const user = await requireRole("client");
      expect(user?.id).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("is refused by the staff gate", async () => {
      expect(await requireRole("staff")).toBeNull();
    });

    it("is refused by the admin gate", async () => {
      expect(await requireRole("admin")).toBeNull();
    });

    it("is refused by a mixed staff+admin gate", async () => {
      expect(await requireRole("staff", "admin")).toBeNull();
    });

    it("is admitted when every role is listed", async () => {
      expect(await requireRole("client", "staff", "admin")).not.toBeNull();
    });
  });

  describe("a staff-role user", () => {
    beforeEach(() => {
      fakeCookies.entries.set(SESSION_COOKIE, STAFF_SESSION);
      fakeDb.selectRows = [userRow("22222222-2222-2222-2222-222222222222", "staff@example.com", "staff", "Sam Staff")];
    });

    it("is admitted to the staff gate", async () => {
      expect(await requireRole("staff")).not.toBeNull();
    });

    it("is admitted to a mixed staff+admin gate", async () => {
      expect(await requireRole("staff", "admin")).not.toBeNull();
    });

    it("is refused by the admin-only gate", async () => {
      // staff is strictly below admin; an exact-match check must not widen.
      expect(await requireRole("admin")).toBeNull();
    });

    it("is admitted by an unrestricted gate", async () => {
      expect(await requireRole()).not.toBeNull();
    });
  });

  describe("an admin-role user", () => {
    beforeEach(() => {
      fakeCookies.entries.set(SESSION_COOKIE, ADMIN_SESSION);
      fakeDb.selectRows = [userRow("33333333-3333-3333-3333-333333333333", "admin@example.com", "admin", "Avery Admin")];
    });

    it("is admitted to the admin gate", async () => {
      expect(await requireRole("admin")).not.toBeNull();
    });

    it("is refused by the staff-only gate because matching is exact, not hierarchical", async () => {
      // requireRole does an exact set-membership check (lib/auth.ts:126), so an
      // admin does NOT implicitly satisfy a staff-only gate. Both real callers
      // (app/inquiries/page.tsx:23 and app/dashboard/admin/auth.tsx:20) list
      // "admin" and "staff" explicitly, which confirms this is the intended
      // contract rather than an oversight.
      expect(await requireRole("staff")).toBeNull();
    });

    it("is admitted to a gate that lists admin explicitly", async () => {
      expect(await requireRole("staff", "admin")).not.toBeNull();
    });

    it("is admitted to an unrestricted gate", async () => {
      expect(await requireRole()).not.toBeNull();
    });
  });
});