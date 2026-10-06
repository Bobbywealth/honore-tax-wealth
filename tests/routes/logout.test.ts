import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCookies, fakeDb, resetFakes } from "../helpers/fake-db";

vi.mock("next/headers", async () => {
  const { fakeCookies } = await import("@/tests/helpers/fake-db");
  return {
    cookies: async () => fakeCookies,
    // The route reads the Accept header to decide JSON vs redirect.
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

import { POST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE } from "@/lib/auth";

beforeEach(() => {
  resetFakes();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/auth/logout", () => {
  it("returns ok and deletes the stored session when a token is present", async () => {
    fakeCookies.entries.set(SESSION_COOKIE, "some-live-token");

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // destroySession now revokes via an UPDATE (so it is auditable) rather than
    // deleting the row; purgeExpiredSessions is still a DELETE.
    expect(fakeDb.updates).toHaveLength(1);
    expect(fakeDb.deletes).toHaveLength(1);
  });

  it("clears the browser cookie with maxAge 0", async () => {
    fakeCookies.entries.set(SESSION_COOKIE, "some-live-token");

    await POST();

    const clear = fakeCookies.setCalls.at(-1)!;
    expect(clear.name).toBe(SESSION_COOKIE);
    expect(clear.value).toBe("");
    expect(clear.options?.maxAge).toBe(0);
    expect(clear.options?.path).toBe("/");
  });

  it("still clears the cookie when there is no session token", async () => {
    fakeCookies.reset();

    const res = await POST();

    expect(res.status).toBe(200);
    // No token means no per-session delete, but housekeeping still runs.
    expect(fakeDb.deletes).toHaveLength(1);
    expect(fakeCookies.setCalls.at(-1)?.options?.maxAge).toBe(0);
  });

  it("clears the cookie even when the session delete fails", async () => {
    fakeCookies.entries.set(SESSION_COOKIE, "some-live-token");
    fakeDb.failWith = new Error("connection lost");

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fakeCookies.setCalls.at(-1)?.options?.maxAge).toBe(0);
  });

  it("does not throw when the database is unavailable", async () => {
    fakeCookies.entries.set(SESSION_COOKIE, "some-live-token");
    fakeDb.failWith = new Error("DATABASE_URL is not set");

    await expect(POST()).resolves.toBeDefined();
    expect(fakeCookies.setCalls.at(-1)?.value).toBe("");
  });
});