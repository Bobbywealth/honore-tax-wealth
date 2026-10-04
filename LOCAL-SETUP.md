# Honoré Tax & Wealth — local setup

Complete current project source, including assets, build plugins, dependency lockfile, database schema/migrations, and Sites configuration.

## Run locally

1. Install Node.js 22.13 or newer and pnpm 11.25.0 (the version specified in package.json).
2. Open a terminal in this folder.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm dev` and open http://localhost:5173.

The default execution profile for a clean copy is portable (macOS, Windows, or Linux). No Sites plugin is required for these commands. Internet access is needed for initial dependency installation.

## Build and preview

Run `pnpm build`, then `pnpm start` to preview the built Worker locally. See README.md for D1 migration commands and additional platform details. The included configuration simulates Cloudflare bindings locally; this ZIP does not contain production database records or hosting credentials. ChatGPT-hosted authentication requires its hosting platform; local development uses the supplied mock-auth build integration.

## Contents

Application routes and components, public assets, styling, configuration, build support, scripts, vendor files, package.json, pnpm-lock.yaml, and database files are included. Installed dependencies, Git metadata, cache/runtime state, secrets, and historical deployment archives are excluded. Login/dashboard behavior is preserved as implemented in the source.

Source commit: 24b2bbafef416dbcb0102c0ebb0283f23dc9bb0f
