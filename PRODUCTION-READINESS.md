# Honoré Tax & Wealth - Production Readiness (master doc)

## Decisions (2026-10-05, Bobby)
Render web service ($7) + free Postgres; Resend; Better Auth (no Clerk). Document storage: Cloudflare R2 (default). Tracking: GitHub issues #3-#16.

## Phase 1 status

| Step | Status | Notes |
|---|---|---|
| P1-01 Audit | Complete | This doc + PR #17 |
| P1-02 Remove ?preview=1 bypass | Complete | PRs #1 + #2. Verified live |
| P1-03 Real typecheck | Complete | PR #1. CI green |
| P1-04 Render Postgres | Complete | `honore-pg` (dpg-db241tnlot8c73doj82g-a, free, Oregon, PG 16). `DATABASE_URL` set on web service. External direct connect rejected (in-network only) |
| P1-05 Migrate runtime off Vinext/Wrangler | **Required before any DB-backed feature works** | Vinext builds a Cloudflare Worker manifest at build time. Adding `/api/probe` post-build returns 404. `process.env.DATABASE_URL` is set but `env.DB` from `cloudflare:workers` is undefined in wrangler-dev. |

## Live verification (2026-10-06)
- `POST /api/consultations` returns 503 `Unable to save the request` (route is wired but `env.DB` is undefined).
- `/dashboard/admin?preview=1` returns "Access restricted" (PR #2 fix verified live).

## Why P1-05 is the only path forward
The app uses Vinext (Cloudflare Workers via Vite + wrangler). Render runs `wrangler dev --local` with `persistTo: .wrangler/state`. In this mode:
- `env.DB` (the Cloudflare D1 binding) is undefined because no D1 was provisioned.
- `process.env.DATABASE_URL` is set on the Node host, but the route handler reads from `cloudflare:workers` so it never sees it.
- Adding new API routes after the prerendered build returns 404 because the route manifest is build-time only.

## Next concrete step (Phase 1.5, big PR)
Migrate to standard Next.js on Node so we get a real runtime:
- Replace `node scripts/run-framework.mjs build` with `next build`.
- Replace `wrangler dev --local` start with `next start -p $PORT -H 0.0.0.0`.
- Port `db/index.ts` off D1 to `drizzle-orm/node-postgres` against `process.env.DATABASE_URL`.
- Port `app/api/consultations/route.ts`, `app/dashboard/admin/page.tsx`, `app/inquiries/page.tsx` off `cloudflare:workers`.
- Remove `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `vinext`, `wrangler` from devDeps; drop `scripts/run-framework.mjs`, `scripts/sites-env.*`.
- Add `db/postgres/migrate.ts` that runs `CREATE TABLE IF NOT EXISTS consultations (...)` on first request.
- Verify on a separate Render staging service off this branch; only flip production after smoke test.
