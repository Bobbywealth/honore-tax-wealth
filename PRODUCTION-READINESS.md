# Honoré Tax & Wealth — Production Readiness

**Source of truth for every run.** If this file disagrees with a plan, trust this file.
Last updated: 2026-10-05 (run at ~22:20–22:45 EDT).

---

## TL;DR — the site is up, but one dashboard field blocks everything else

Production is **healthy and serving** (HTTP 200). It is serving the **old** wrangler/Vinext
build (`48793ed`), because every deploy of the new Node runtime has failed at *startup*.

**Exactly one thing is blocking the migration**, and it cannot be fixed from the CLI:

> **Render web service `honore-tax-wealth` still has the old wrangler start command.**
> Change **Start Command** to `pnpm run start`. Full steps in
> [The blocker](#the-blocker--one-dashboard-field).

Do that one change and the next deploy completes Phase 1.5. Do not start other Phase 2 work
until the database milestone is verified live.

---

## Live state

| Thing | State |
|---|---|
| `https://honore-tax-wealth.onrender.com` | HTTP 200, title "Honoré Tax & Wealth" |
| Serving commit | `48793ed` — **old** wrangler/Vinext runtime, not the Node runtime |
| Web service | `srv-db18i79srm7s73aiq96g`, free plan, oregon, branch `main`, autoDeploy on commit |
| Postgres | `honore-pg` / `dpg-db241tnlot8c73doj82g-a`, free, available, PG 16, oregon |
| Repo | `origin/main` @ `ba691ac` — contains **all** Phase 1.5 + auth + email work |
| Feature branch | `feat/node-runtime-postgres` @ `a374b57`, pushed, identical tree to `main` |

### Actively serving traffic: the OLD runtime

`main` contains the new Node runtime. It is not what answers requests, because the service
crashes on startup every time it is deployed. Render keeps the last *successful* deploy
serving, so visitors get the old build and never notice. The old build has **no database** —
consultation submissions on the live site go nowhere.

---

## The blocker — one dashboard field

Render's stored service config (verified via `render services get`):

```
buildCommand: pnpm install --frozen-lockfile && npm run build
startCommand: node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev \
              --config dist/server/wrangler.json --local --persist-to .wrangler/state \
              --ip 0.0.0.0 --port $PORT --inspector-port 0
```

That start command needs **three things that no longer exist** in the repo:

| Referenced path | Exists? |
|---|---|
| `./scripts/sites-env.mjs` | **deleted** in the runtime rewrite |
| `dist/server/wrangler.json` | **deleted** — `next build` emits `.next/`, never `dist/server/` |
| `node_modules/wrangler/bin/wrangler.js` | **gone** — `wrangler` was removed from `package.json` |

So the process cannot start. Evidence this is the failure and not the build:
the failing deploy is `update_failed` (build phase passed, startup failed), **not**
`build_failed`, and the local build is green with the same commands.

### Fix (needs the human, ~30 seconds)

1. Open <https://dashboard.render.com/web/srv-db18i79srm7s73aiq96g>
2. **Settings** → scroll to **Build & Deploy**
3. Clear the **Start Command** field (delete the entire wrangler line) and enter:

   ```
   pnpm run start
   ```

4. **Save Changes**. This triggers a fresh deploy automatically.
5. Watch it in **Events**. Expect: `Installing dependencies` → `Building` → `Deploying` →
   Live. A green run means the Node runtime is live.

Optional while you are in that panel:

- **Build Command** → change `npm run build` to `pnpm run build`. Both work; `pnpm` is
  consistent with the rest of the pipeline.
- **Health Check Path** → `/api/health`. Once the service runs on Node, this reports real
  database state (200 ok / 503 unreachable) instead of just "process is up". Leave it at `/`
  until the Node runtime is confirmed live — do not change both at once, so a failure is
  unambiguous.

### Why this could not be done from the CLI

- `render services` has only an `instances` subcommand — there is **no** `services update`
  / `config` command in v2.7.0.
- `render blueprints` only offers `validate`. There is no "apply blueprint" command, and the
  service was not created from the blueprint anyway, so `render.yaml` has never synced to it.
- No `RENDER_API_KEY` is present in the environment, so the REST API cannot be used either.
- `~/.render/cli.yaml` holds an interactive-login credential only.

`render.yaml` in the repo is already correct (`startCommand: pnpm run start`,
`healthCheckPath: /`) and validates clean. It is documentation of intent, **not** the source
of truth for this service — do not assume editing it changes anything.

---

## Phase status

| Step | Status | Notes |
|---|---|---|
| P1-01 Audit | Complete | This doc |
| P1-02 Remove `?preview=1` bypass | Complete | PRs #1, #2 |
| P1-03 Real typecheck | Complete | PR #1 |
| P1-04 Render Postgres created | Complete | `honore-pg` live, `DATABASE_URL` set on service |
| P1-05 Runtime off wrangler → Node | **Code complete, build green, BLOCKED on start command** | This run |
| P1-05b Drizzle/Postgres layer | **Code complete, verified locally, NOT verified live** | This run |
| P2 auth (Better Auth replacement) | **Closed ahead of plan** | `c73ce07`: real scrypt+sessions replaced the spoofable header gate |
| P6 Resend email (#13) | **Code complete, verified locally, needs API key + DNS** | This run |
| GitHub #3–#16 | Open | See backlog |

### Closed ahead of plan: the PII exposure

`c73ce07` removed a live vulnerability. `/dashboard/admin` and `/inquiries` were gated on a
plaintext request header (`oai-authenticated-user-id`) with a hardcoded UUID in the repo — any
anonymous visitor could set it with curl and read every consultation (name, email, phone, tax
message). It is now a server-verified HttpOnly session backed by Postgres; the session table
stores only a SHA-256 of the token. `requireRole("admin","staff")` is the gate; the old header
now appears **only in comments explaining the fix**. No further action needed.

The plan called for Better Auth here. The implementation that landed is hand-rolled
scrypt + Postgres sessions, which is functional and closes the hole. Adopting Better Auth later
is a deliberate choice, not an outstanding defect — decide it before real client data lands.

---

## Verified this run (evidence, not inference)

**Build pipeline — green, matching Render's commands:**

| Check | Command | Result |
|---|---|---|
| Lockfile policy | `pnpm install --frozen-lockfile` | exit 0 |
| Production build (no DB, as on Render) | `DATABASE_URL` unset, `pnpm run build` | exit 0, 22 routes, TS clean |
| Lint | `pnpm run lint` | exit 0 (0 errors, 31 pre-existing warnings) |

The two `prefer-const` lint errors that made `pnpm run lint` exit 1 are fixed.

**Functional — local Postgres 14 + the real production build:**

| Test | Result |
|---|---|
| `POST /api/consultations` valid | **201** + real row inserted |
| Honeypot field filled | 200, **silently dropped, no row** |
| Invalid payload | **400**, no row |
| `GET /api/health` with DB up | **200** `{"status":"ok","database":"ok"}` |
| Boot without `DATABASE_URL` | refuses with `DATABASE_URL is required but not set` |
| `POST /api/auth/login` bootstrap admin | 200, session cookie, `role: admin` |
| `/inquiries` **without** cookie | **no PII in body** ("Access restricted") |
| `/inquiries` **with** cookie | shows leads correctly |
| `/dashboard/admin` spoofed header | **no PII in body** |
| Email with Resend unconfigured | still **201**, row stored, `not_configured` logged |
| Email with an **invalid** Resend key | still **201**, row stored, `send_failed` logged |
| HTML escaping | `<script>` and attribute-breakout payloads neutralised in both templates |

Logs carry no raw PII: name/email/phone are never logged, IPs are salted-hashed, and upstream
Resend errors are redacted of anything email-shaped before logging.

**Not yet verified:** anything against `honore-pg` on Render. That requires the start-command fix.

---

## Risks and deadlines

1. **`honore-pg` expires 2026-11-05** (`expiresAt: 2026-11-05T00:29:42Z`). Free Postgres
   instances expire after 30 days. **It must be upgraded before the site stores real client
   data**, or the database is deleted. ~31 days from this run.
2. **Lead capture is currently dead.** The live site runs the old runtime with no database, so
   every consultation submitted by a real visitor is lost. This is the actual business risk and
   it lasts exactly as long as the start-command blocker.
3. **Free Postgres has no backups** and Render's free tier suspends idle instances. Pair with
   #15 (backups + restore drill).
4. **Build minutes.** Hobby includes 500 build minutes/month, then $5/1K. With no payment
   method on file, exceeding the quota disables new builds for the rest of the month. Always
   prove the local build first. Failed deploys still consume minutes.
5. **Free web instances sleep** after inactivity, so the first request after an idle period is
   slow and a curl may need `--max-time 60`.

---

## Backlog (GitHub #3–#16, all open)

| # | Title | Note |
|---|---|---|
| #3 | Move runtime off wrangler-dev to Node on Render | Code done; **blocked** on start command |
| #4 | Render Postgres + Drizzle migrations, env schema, `.env.example` | Code done; **blocked** |
| #5 | Better Auth on Postgres | Superseded in practice by `c73ce07`; decide deliberately |
| #6 | RBAC (Owner/Admin/Staff/Client) + authz tests | `requireRole` exists; roles not enforced end-to-end |
| #7 | TOTP MFA for staff before real client data | **Do before going live with real data** |
| #8 | Durable Postgres-backed rate limiting + audit log | In-memory per-IP limits now |
| #9 | Full data model + migrations | consultations/users/sessions only |
| #10 | Private document storage (R2) + upload | Needs a bucket created |
| #11 | Make admin dashboard real (remove demo arrays, `href="#"`) | Dashboard still largely demo data |
| #12 | Client portal real | — |
| #13 | Resend transactional email + SPF/DKIM/DMARC | **Code done this run**; needs API key + DNS |
| #14 | Tests (unit/integration/e2e/authz) + branch protection | None exist yet |
| #15 | Monitoring, backups, restore drill, failure runbook | — |
| #16 | Final QA (links, SEO, a11y, browsers, perf) | — |

### Resend go-live steps (#13)

Code is done and merges safely whether or not Resend is configured. To actually send:

1. Create a Resend account, add and verify the sending domain (SPF + DKIM + DMARC records in DNS).
2. Render → service → **Environment**: add `RESEND_API_KEY`, and
   `EMAIL_FROM="Honoré Tax & Wealth <notifications@yourdomain.com>"`.
   Add `CONSULTATION_NOTIFY_EMAIL` for where new leads are delivered (falls back to
   `ADMIN_EMAIL`).
3. Do **not** use Resend's `onboarding@resend.dev` in production — it only delivers to your own
   account inbox.
4. Until configured, `consult.email` logs `reason="not_configured"`. After configuring, submit a
   test consultation and confirm `sent: true`.

---

## Runbook: verify the database milestone once unblocked

The single test that closes Phase 1.5 — do not skip it, do not infer it from a 200:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST https://honore-tax-wealth.onrender.com/api/consultations \
  -H 'content-type: application/json' \
  -d '{"name":"Milestone Check","email":"milestone@example.com","phone":"305-555-0100",
       "service":"Tax planning","message":"Phase 1.5 verification","website":""}'
```

Expect **HTTP 201**, then confirm a real row exists — the response alone does not prove
persistence:

```bash
render logs -r srv-db18i79srm7s73aiq96g --limit 40 -o json   # look for consult.created + consult.email
render psql dpg-db241tnlot8c73doj82g-a                        # interactive, needs a TTY
# SELECT id,name,email,created_at FROM consultations ORDER BY id DESC LIMIT 5;
```

Also check `GET /api/health` returns `{"status":"ok","database":"ok"}` and that the live service
now boots on the **Node** runtime (Events shows `pnpm run start`, not wrangler).

Then close #3 and #4, and merge the feature branch away if it is still open.

---

## Method notes for the next run

**Verified about the CLI (v2.7.0):**

- `render deploys list <svc-id> -o json` works and includes the commit, status and duration.
- `render deploys create <svc-id> --commit <sha> --confirm -o json` works. **You must pass
  `-o json`/`-o text`** or it panics with `could not open a new TTY`.
- `render logs -r <svc-id> --start <ISO> --end <ISO> -o json` **does** return app logs. These
  are runtime logs from the currently-live instance — they will show the *old* build's
  `[wrangler:info]` lines, not the new deploy's startup error.
- `render blueprints validate render.yaml` works (validation only, no apply).
- `render services get <id> -o json` dumps the **entire workspace**; filter for the object whose
  `id` matches. This is the reliable way to read the stored start/build command.

**Deploy status vocabulary — do not misread it:**

- `build_failed` = the build command failed. Fix code, do not chase startup.
- `update_failed` = the build passed and **the new version failed to start**. This is the
  current state, and it points squarely at the start command.

**Working rules:**

- Prove `pnpm install --frozen-lockfile && pnpm run build` locally before every deploy.
- Never merge to `main` a change that has not been proven to start locally. A failed deploy
  leaves the previous deploy serving, so production survives mistakes — but every attempt
  burns build minutes.
- A concurrent process has been committing to this repo during runs (see "Provenance" below).
  Re-read `git log` and `git status` before assuming your working tree is yours.

### Provenance note

During this run, four files appeared in the working tree that were not written by the run that
found them: `lib/env.ts`, `lib/shutdown.ts`, `instrumentation.ts`, `app/api/health/route.ts`,
and two commits (`3ddbb1a`, `a374b57`) plus a merge to `main` (`ba691ac`) were created by that
other process. All of it was **reviewed, built, and tested** before being accepted: the boot
validation skips the build phase, logs variable *names* only, `attachShutdown` deliberately
avoids `process.exit()`, and `/api/health` exposes no hostnames or connection strings. Two
independent commits landing on the branch while an agent worked on it means **more than one
agent may be active** — coordinate before making overlapping edits.