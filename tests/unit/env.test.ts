import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectEnv, validateEnv } from "@/lib/env";

const ENV_KEYS = ["DATABASE_URL", "LOG_SALT", "ADMIN_EMAIL", "ADMIN_PASSWORD", "NEXT_PHASE"] as const;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inspectEnv", () => {
  it("is not ok when DATABASE_URL is missing", () => {
    const report = inspectEnv();
    expect(report.ok).toBe(false);
    expect(report.missing).toContain("DATABASE_URL");
  });

  it("treats a whitespace-only DATABASE_URL as missing", () => {
    process.env.DATABASE_URL = "   ";
    expect(inspectEnv().missing).toContain("DATABASE_URL");
  });

  it("is ok with a valid postgres URL", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const report = inspectEnv();
    expect(report.ok).toBe(true);
    expect(report.missing).toHaveLength(0);
    expect(report.malformed).toHaveLength(0);
  });

  it("accepts the postgresql:// scheme variant", () => {
    process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";
    expect(inspectEnv().ok).toBe(true);
  });

  it("flags a non-postgres URL as malformed", () => {
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db";
    const report = inspectEnv();
    expect(report.ok).toBe(false);
    expect(report.malformed).toContain("DATABASE_URL");
  });

  it("warns about each missing recommended variable without failing", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const report = inspectEnv();
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(expect.arrayContaining(["LOG_SALT", "ADMIN_EMAIL", "ADMIN_PASSWORD"]));
  });

  it("warns when the bootstrap admin password is under 12 characters", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    process.env.ADMIN_PASSWORD = "elevenchars";
    expect(inspectEnv().warnings).toContain("ADMIN_PASSWORD (<12 chars, bootstrap will refuse it)");
  });

  it("does not warn about a long enough admin password", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    process.env.ADMIN_PASSWORD = "twelvechars1";
    expect(inspectEnv().warnings).not.toContain("ADMIN_PASSWORD (<12 chars, bootstrap will refuse it)");
  });

  it("never reports an environment variable's value", () => {
    process.env.DATABASE_URL = "not-a-url-at-all";
    process.env.ADMIN_PASSWORD = "short";
    const rendered = JSON.stringify(inspectEnv());
    expect(rendered).not.toContain("short");
    expect(rendered).not.toContain("not-a-url-at-all");
  });
});

describe("validateEnv", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => validateEnv()).toThrow(/DATABASE_URL is required but not set/);
  });

  it("throws naming a malformed URL distinctly from a missing one", () => {
    process.env.DATABASE_URL = "mysql://host/db";
    expect(() => validateEnv()).toThrow(/DATABASE_URL is set but malformed/);
  });

  it("does not throw for a valid configuration", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    expect(() => validateEnv()).not.toThrow();
  });

  it("does not throw during a production build, when no database is expected", () => {
    // `next build` runs on a machine with no DATABASE_URL; failing there would
    // break every deployment.
    process.env.NEXT_PHASE = "phase-production-build";
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => validateEnv()).not.toThrow();
  });
});