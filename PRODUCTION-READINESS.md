# Honoré Tax & Wealth - Production Readiness (master doc)

Updated after Phase 1 audit. Status values: Not Started / In Progress / Blocked / Complete.

## Phase 1 audit findings (repo state at d167886)

| Area | Status | Current implementation | Problem |
|---|---|---|---|
| Hosting | Not Started | Render free web service running `wrangler dev --local --persist-to .wrangler/state` (render.yaml) | Dev server with local SQLite-on-disk. Ephemeral on Render free tier, data lost on redeploy. Not production infra. |
| Database | Not Started | `db/schema.ts`: one `consultations` table (D1/SQLite via drizzle), 1 migration | Only 1 of ~12 required entities. Depends on Cloudflare D1 binding that does not exist on Render, so `/api/consultations` returns 503. |
| Authentication | Not Started | `app/login/page.tsx` has disabled Sign in button. Admin gate in `app/dashboard/admin/auth.tsx` | No real auth. |
| Preview bypass | Not Started | `?preview=1` grants admin access in `auth.tsx`; login page still links to `/dashboard/admin?preview=1` and `/dashboard/client` | P0: anyone can open admin UI. (Earlier "remove preview links" commit did not remove them.) |
| Hard-coded owner | Not Started | `ownerId` UUID constant in `auth.tsx`, checked against `oai-authenticated-user-id` header (`chatgpt-auth.ts`) | Identity tied to the ChatGPT hosting header; absent off that platform. |
| RBAC | Not Started | None | Needs Owner/Admin/Staff/Client policies. |
| Rate limiting | Partial | In-memory Map in consultations route | Per-instance only, not durable or shared. |
| Consultation API | Partial (preserve) | Zod validation, honeypot, body cap, salted IP hash logging, no-PII logs | Good, keep. Needs durable DB and shared rate limit. |
| Documents | Not Started | None | No private storage, upload pipeline or audit trail. |
| Admin dashboard | Not Started | 10 pages, all hard-coded arrays; 8 `href="#"` | No real data. |
| Client portal | Not Started | `app/dashboard/client/page.tsx` static | No real data, no auth. |
| Email | Not Started | None | |
| CI | Partial | lint + build | Typecheck step is `node -e "console.log('ok')" \|\| true` (fake). No tests. pnpm 9 in CI vs pnpm 11 in package.json. |
| Tests | Not Started | None | |
| Monitoring / backups | Not Started | None | |
| Public site | Partial (preserve) | Legal pages, security.txt, robots, sitemap, headers, cookie banner | QA pass is Phase 9. |

## Architecture decisions needed from Bobby (work is paused here)
See the decision memo delivered in chat: hosting/runtime, database, auth provider, private document storage, email provider.

## Task log
Each task below will record: Status, Current implementation, Problem, Implementation, Security impact, Tests, Files changed, Remaining work.

### P1-01 Repo audit - Complete
Implementation: this document. No code changed.
## Decisions (2026-10-05, Bobby)
Render web service ($7) + Render Postgres; Resend for email; Better Auth on Postgres (no Clerk; MFA free later, mandatory for staff before real data). Document storage: R2 vs S3 pending. Tracking: GitHub issues #3-#16.

### P1-02 Remove ?preview=1 bypass - Complete (PRs #1, #2)
Problem: bypass in auth.tsx AND a duplicate copy in the admin home page; login page + sitemap linked to it. Implementation: shared checkAdminAccess ignores query params; removed links. Security: closes unauthenticated admin UI access. Verified live: /dashboard/admin and /dashboard/admin/clients with ?preview=1 return Access restricted. Remaining: owner-UUID header gate is interim (P2-01); /dashboard/client is a public static mock.

### P1-03 Real typecheck - Complete (PR #1)
CI runs tsc --noEmit; 20 real type errors fixed. CI had been failing on main since at least Oct 4 (duplicate pnpm version) - fixed. Two stylistic lint rules disabled with documented reasons. CI green: install, lint, typecheck, build. Remaining: tests, security checks, branch protection (P7).
