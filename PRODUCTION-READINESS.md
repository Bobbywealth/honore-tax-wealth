# I Honore Tax & Wealth — Production Readiness

**Source of truth for every run.** If this file disagrees with a plan, trust this file.
Last updated: 2026-10-22 (verified live this session).

> **History:** the earlier Phase 1 audit and the 2026-10-05 decision log are preserved at
> `docs/production-readiness-audit-2026-10-05.md`. Both this file and that audit were written
> while the site still ran the old wrangler/Vinext build; every item in that audit is now
> either complete or superseded.

---

## Live state

| Thing | State |
|---|---|
| `https://ihonoretaxandwealth.com` | HTTP 200, title "I Honore Tax & Wealth" |
| `https://honore-tax-wealth.onrender.com` | HTTP 200 — same build, Render default domain |
| Web service | `srv-db18i79srm7s73aiq96g`, autoDeploy from `main` |
| Postgres | `honore-pg` / `dpg-db241tnlot8c73doj82g-a` |
| Repo | `Bobbywealth/honore-tax-wealth`, **public**, `main` |
| Runtime | Node (Next 16 / Vinext), building and starting cleanly |

## Brand

The official name is **I Honore Tax & Wealth** — the leading "I" is part of the name, not a
typo. The gold **H** monogram logo is unchanged and is not meant to become an I. The live
domain `ihonoretaxandwealth.com` reflects the same name. Keep display strings consistent
everywhere; do **not** touch `honoretaxwealth.com` (email domain), `honore-tax-wealth`
(service/repo slug) or asset filenames.

## Architecture

- **Schema** (`db/schema.ts` + `db/migrate.ts`): ~30 tables covering identity, clients,
  engagements, tax years, returns, documents, document requests, tasks, appointments,
  conversations, invoices, consents, notifications, signable documents and audit events.
  Migrations are an ordered array of idempotent statements; **additive columns need an
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`**, because `CREATE TABLE IF NOT EXISTS` is a
  no-op once the table exists. Place the ALTER *after* the matching CREATE so a fresh
  database has the table first.
- **Auth** (`lib/auth.ts`): Argon-style password hashing, SHA-256 hashed session tokens
  (raw token never stored), HttpOnly / SameSite=lax cookies, `sessions_valid_from` watermark
  for forced logout on password change, per-IP and per-account lockouts. Routes cover login,
  registration, logout, logout-everywhere, change-password, forgot/reset-password,
  email verification and TOTP MFA (`lib/mfa.ts`) for staff.
- **Roles**: `client`, `staff`, `assistant`, `admin`.
- **Access control** (`lib/access.ts`): one rule, enforced in one place — staff/admin may read
  any client; a client may read only a client row joined to their user id through
  `client_access`. No decision path reads access from a URL segment, an email field or a
  header. Non-admin staff are row-scoped via `scopedClientIdsFor()`.
- **Portal separation**: `/login` and `/agent` are separate entry points. `POST /api/auth/login`
  accepts an `audience` and rejects a mismatch **before minting a session or an MFA challenge**,
  so a client account cannot enter the team workspace and vice versa. The check runs only after
  the credential is proven, so it cannot be used to probe which addresses hold agent accounts.
  Verified live 2026-10-22 across 5 cases (both cross-portal cases return 403 `wrong_portal`
  with no cookie; bad credentials return an identical 401).
- **Client-facing status** (`lib/client-status.ts`): clients see six plain-language phases and
  never the internal `returns.stage` vocabulary. "Action Needed" is an interrupt and outranks
  the pipeline.
- **Agent client list** (`app/dashboard/admin/_lib/agentList.ts`): columns for tax year, return
  type, filing method, status, documents received/missing, last activity and next step, all
  derived from live engagement/return/request/task rows rather than stored labels. Filter chips
  are bucket-based and counted against the caller's scoped row set.
- **Storage** (`lib/storage.ts`, `lib/storage-s3.ts`): `StorageDriver` interface. Local disk is
  the development fallback; an S3-compatible driver with hand-rolled SigV4 is selected
  automatically when the `S3_*` env block is present. **Local disk does not survive a Render
  restart and is not acceptable for tax documents.**
- **Email** (`lib/email.ts`): Resend. `mailConfigured()` returns false until **both**
  `RESEND_API_KEY` and `EMAIL_FROM` are set, so sends silently no-op until then.

## Open items

| # | Item | Impact |
|---|---|---|
| 1 | `RESEND_API_KEY` + `EMAIL_FROM` not set | Password resets, verification and document requests return success but send nothing |
| 2 | `S3_*` block not set | Client document uploads land on ephemeral disk and are lost on redeploy |
| 3 | No `staff` account seeded | Agent-side row scoping is verified by structure and tests, not by eye |
| 4 | Test rows in the client list (`TEST Client Delete Me`) | Cosmetic; delete before showing the portal to anyone |
| 5 | 17 failing tests in `tests/unit/marketing.test.ts` and `tests/routes/consultations.test.ts` | Pre-existing, identical before and after the 2026-10-22 work |
| 6 | 8 `codex/*` branches + 2 `docs/*` branches unmerged | Unrelated histories — not mergeable into `main`; review or delete deliberately |

## Reusable recipes

- **Render env-var writes**: use `PUT /v1/services/{id}/env-vars/{KEY}` (single-key), never the
  bulk endpoint, which replaces the whole set. Then trigger a fresh deploy — `render restart`
  does not reload env. Wait ≥90s before verifying the new value is live.
- **Deploy verification**: `GET /v1/services/{id}/deploys?limit=1` and wait for `status: live`.
  A `pre_deploy_failed` on a running service is a stale-deploy problem, not an outage.
- **Shared repo**: `git fetch && git pull --rebase origin main`, preserve the other change, push
  normally. Never force-push.
- **`edit_file` with `appendText`**: always pass `edits: []`, then check the file's last 50 bytes
  for a stray `</appendText>` trail.
- **Regex literals written via `edit_file`** can arrive double-escaped; compile each one to check.
