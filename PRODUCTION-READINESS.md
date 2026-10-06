# Honoré Tax & Wealth - Production Readiness (master doc)

## Decisions (2026-10-05, Bobby)
Render web service ($7) + free Postgres; Resend; Better Auth (no Clerk). Document storage: Cloudflare R2 (default). Tracking: GitHub issues #3-#16.

## Phase 1 progress

### P1-01 Repo audit - Complete
Master doc and PR #17.
### P1-02 Remove ?preview=1 bypass - Complete (PRs #1, #2)
Verified live: admin URLs locked.
### P1-03 Real typecheck - Complete (PR #1)
CI green: install, lint, typecheck, build.
### P1-04 Render Postgres + DATABASE_URL on web service - Complete (PR #18, manual infra)
- Created `honore-pg` (id `dpg-db241tnlot8c73doj82g-a`, free, Oregon, Postgres 16).
- Suspended `servio-voice-staging-pg` to free the one-free-Postgres slot.
- Set `DATABASE_URL` env var on `srv-db18i79srm7s73aiq96g` to `postgresql://honore_pg_user:...@dpg-db241tnlot8c73doj82g-a/honore_pg`. Saved to `artifacts/honore-pg-connection.txt` (mode 600). External direct connection rejected (sandbox / cert / not in Render network); internal DNS only.
- Live consultation API still 503 because the runtime is Vinext/Wrangler and reads `env.DB` from `cloudflare:workers`, not `process.env.DATABASE_URL`. Phase 1.5 unblocks it.
### P1-05 Migrate runtime off Vinext/Wrangler to plain Next.js on Node - In progress
Plan: branch `feat/node-runtime-postgres`; staging Render service off that branch; replace Vite + vinext + wrangler with `next build` / `next start`; port `db/index.ts`, the consultation route, the inquiries page and admin home off `cloudflare:workers`; wire `DATABASE_URL` via `process.env`; run migrations on boot (idempotent); verify consultation save on staging; then cut production.

## Open
- Phase 2 auth, RBAC, MFA, rate limiting.
- Phase 3 data model + documents.
- Phase 4-9.
