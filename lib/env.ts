/**
 * Startup environment validation.
 *
 * Required variables are hard failures: the application cannot function
 * without them, and a clear message at boot is far cheaper to diagnose than a
 * 500 on the first consultation submission.
 *
 * Recommended variables warn only, because a missing value degrades a
 * non-critical behaviour (log anonymisation, first-run admin bootstrap)
 * rather than taking the site down.
 *
 * Only variable NAMES are ever reported. Values are never logged.
 */

const REQUIRED = ["DATABASE_URL"] as const;

const RECOMMENDED = ["LOG_SALT", "ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;

// Render injects DATABASE_URL as a postgres:// URL. Reject the obvious
// misconfigurations early instead of failing later with a driver error.
const URL_SHAPE: Record<string, RegExp> = {
  DATABASE_URL: /^postgres(ql)?:\/\/[^\s]+/i,
};

export type EnvReport = {
  ok: boolean;
  missing: string[];
  malformed: string[];
  warnings: string[];
};

export function inspectEnv(): EnvReport {
  const missing: string[] = [];
  const malformed: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED) {
    const value = process.env[key];
    if (!value || !value.trim()) {
      missing.push(key);
      continue;
    }
    const shape = URL_SHAPE[key];
    if (shape && !shape.test(value)) malformed.push(key);
  }

  for (const key of RECOMMENDED) {
    if (!process.env[key] || !process.env[key]!.trim()) warnings.push(key);
  }

  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 12) {
    warnings.push("ADMIN_PASSWORD (<12 chars, bootstrap will refuse it)");
  }

  return { ok: missing.length === 0 && malformed.length === 0, missing, malformed, warnings };
}

export function validateEnv(): void {
  // Never run during `next build`: the build machine legitimately has no
  // DATABASE_URL, and failing there would break every deployment.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const report = inspectEnv();

  for (const key of report.warnings) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "env.warning",
        key,
        detail: "not set; related feature may be degraded",
      }),
    );
  }

  if (report.ok) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "env.ok" }));
    return;
  }

  const detail = [
    ...report.missing.map(k => `${k} is required but not set`),
    ...report.malformed.map(k => `${k} is set but malformed`),
  ].join("; ");

  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "env.invalid", detail }));
  throw new Error(`Invalid environment configuration: ${detail}`);
}