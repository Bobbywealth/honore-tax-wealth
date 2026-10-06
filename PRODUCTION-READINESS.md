# Honoré Tax & Wealth - Production Readiness (master doc)

## Decisions (2026-10-05, Bobby)
Render web service ($7) + free Postgres; Resend; Better Auth (no Clerk). Cloudflare R2 default for documents. Tracking: GitHub issues #3-#16.

## Phase 1 status

| Step | Status | Notes |
|---|---|---|
| P1-01 Audit | Complete | This doc + PR #17 |
| P1-02 Remove ?preview=1 bypass | Complete | PRs #1 + #2. Verified live |
| P1-03 Real typecheck | Complete | PR #1. CI green |
| P1-04 Render Postgres | Complete | `honore-pg` (dpg-db241tnlot8c73doj82g-a, free, Oregon, PG 16). `DATABASE_URL` set on web service |
| P1-05 Runtime rewrite (Vinext -> Next.js on Node) | **In progress on `feat/node-runtime-postgres`** | Branch carries: Postgres db module, route/admin/inquiries ports, dropped Vinext/Wrangler/Cloudflare deps, `next dev`/`next build`/`next start` scripts, Postgres drizzle.config, `.env.example`. Live service untouched until staging smoke-test passes |

## What changed in this branch (P1-05)
- `db/schema.ts`: Postgres pgTable for consultations, with email + createdAt indexes.
- `db/index.ts`: replaced D1 wrapper with `drizzle-orm/node-postgres` + `pg.Pool` reading `process.env.DATABASE_URL`. Connection cached on `globalThis` so dev/HMR doesn't open new pools.
- `db/migrate.ts`: idempotent `CREATE TABLE IF NOT EXISTS` + indexes; runs on first request.
- `app/api/consultations/route.ts`: Node runtime (`runtime = "nodejs"`, `dynamic = "force-dynamic"`); uses `db.insert(consultations)` instead of D1.
- `app/dashboard/admin/page.tsx`: pulls inquiries from Postgres via Drizzle.
- `app/inquiries/page.tsx`: same; keeps the interim owner-header gate (replaced by Better Auth in P2-01).
- Deleted: `vite.config.ts`, `cloudflare-env.d.ts`, `scripts/`, `build/`, `examples/`, `.openai/`, `pnpm-workspace.yaml`, stale SQLite drizzle files.
- Added: `.env.example`, Postgres drizzle.config, `pg` + `@types/pg` deps.
- Removed deps: `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `vinext`, `wrangler`, `@vitejs/plugin-react`, `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `vite`.

## What still needs verification on a Render staging service
1. `pnpm install --frozen-lockfile` succeeds on the new deps (`pg`, no Cloudflare).
2. `pnpm run build` produces a Next.js build (not a Vite/Wrangler output).
3. `pnpm run start` serves the site.
5. `POST /api/consultations` saves a row to `honore-pg` and returns 201.
6. `/inquiries` lists it (with the owner header).

## Production cutover plan (after staging is green)
1. Merge `feat/node-runtime-postgres` to `main`.
2. `DATABASE_URL` is already set on `srv-db18i79srm7s73aiq96g` from earlier.
3. Render auto-deploys from `main`. Verify on `https://honore-tax-wealth.onrender.com/api/consultations` (POST) and `/inquiries` (with owner header).
