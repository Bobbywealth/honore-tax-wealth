import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDb, resetFakes } from "../helpers/fake-db";

vi.mock("@/db", async () => {
  const { fakeDb } = await import("@/tests/helpers/fake-db");
  return {
    getDb: () => fakeDb,
    getPool: () => ({ end: async () => {} }),
  };
});

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  resetFakes();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports unconfigured and stays 200 when DATABASE_URL is absent", async () => {
    // A build machine legitimately has no database; that is "not configured",
    // not "degraded".
    vi.stubEnv("DATABASE_URL", "");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("unconfigured");
  });

  it("reports ok when the database responds", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/honore");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(fakeDb.executes.length).toBeGreaterThan(0);
  });

  it("reports degraded and 503 when the database is unreachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/honore");
    fakeDb.failWith = new Error("ECONNREFUSED 10.0.0.5:5432");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
  });

  it("sets cache-control no-store", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("never leaks the connection string or driver error text", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://admin:sup3rs3cret@db.internal:5432/honore");
    fakeDb.failWith = new Error("password authentication failed for user admin");

    const res = await GET();
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain("sup3rs3cret");
    expect(raw).not.toContain("db.internal");
    expect(raw).not.toContain("password");
  });

  it("returns a numeric latency measurement", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const body = await (await GET()).json();
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });
});