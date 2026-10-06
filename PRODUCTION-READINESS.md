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
| P1-05 Runtime rewrite (Vinext -> Next.js on Node) | **Code complete on `feat/node-runtime-postgres` (commit 948b583); build verification on Render FAILED, log access blocked from sandbox. Live service reverted to `main` so site is healthy.** |

## Phase 1.5 code changes (branch `feat/node-runtime-postgres`)
- `db/schema.ts`: Postgres pgTable for consultations, with email + createdAt indexes.
- `db/index.ts`: `drizzle-orm/node-postgres` + `pg.Pool` reading `process.env.DATABASE_URL`.
- `db/migrate.ts`: idempotent `CREATE TABLE IF NOT EXISTS` + indexes; runs on first request.
- `app/api/consultations/route.ts`: `runtime = "nodejs"`; uses `db.insert(consultations)`.
- `app/dashboard/admin/page.tsx`: pulls inquiries from Postgres via Drizzle.
- `app/inquiries/page.tsx`: same; keeps the interim owner-header gate (replaced by Better Auth in P2-01).
- Deleted: `vite.config.ts`, `cloudflare-env.d.ts`, `scripts/`, `build/`, `examples/`, `.openai/`, `pnpm-workspace.yaml`, stale SQLite drizzle files.
- Added: `.env.example`, Postgres drizzle.config, `pg` + `@types/pg` deps.
- Removed deps: `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `vinext`, `wrangler`, `@vitejs/plugin-react`, `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `vite`.

## What went wrong on the Render build
The first deploy of this branch to the live Render service returned `status: build_failed`. The Render REST API does not expose build logs from this sandbox (all `/deploys/{id}/logs*` endpoints returned 404). Without logs I cannot pinpoint the failure. Likely candidates:
- `pnpm install --frozen-lockfile` failure: lockfile still has Cloudflare-only resolutions (esbuild native binaries, workerd, miniflare) that may not match the new dep set.
- Missing `pg` resolution if the lockfile wasn't regenerated.
- Next 16 build failure on first attempt (no .next cache, fresh RSC compile).

## What I'd do next (manual, in browser if needed)
1. Open `https://dashboard.render.com/web/srv-db18i79srm7s73aiq96g/deploys/dep-db24b21up7fs73cf8k7g` and read the actual build error.
2. If it's a lockfile issue: regenerate locally with `pnpm install --no-frozen-lockfile` then commit the new `pnpm-lock.yaml`.
3. If it's a Next 16 config issue: most likely the static asset imports or the openapi-type definitions in the Vinext-shaped `next.config.ts` need to be relaxed for plain Next.
4. Push a fix commit to `feat/node-runtime-postgres`. Trigger a redeploy via the dashboard's "Manual Deploy" button (which surfaces them).
5. Smoke-test on the dashboard URL once live: `POST /api/consultations` with a valid body should return 201, and a row should appear in `honore-pg`.

## Live state right now
- `srv-db18i79srm7s73aiq96g` is back on branch `main`, build `7d13630`, wrangler start command. Site returns 200.
- `honore-pg` is live and unused.
- `feat/node-runtime-postgres` exists at `948b583` and is what the next agent should iterate from.
