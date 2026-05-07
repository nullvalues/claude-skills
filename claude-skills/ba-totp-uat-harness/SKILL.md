---
name: ba-totp-uat-harness
description: Scaffold a Playwright UAT harness for a Next.js project that uses Better Auth with the twoFactor (TOTP) plugin. Drops in an e2e/ directory, MCP config, and a fixture pattern that drives Better Auth's HTTP endpoints to obtain an authenticated Playwright storageState. Use when the target project has /api/auth/* routes from better-auth, twoFactor enabled, mandatory TOTP enforcement, and authenticated routes that need browser-based UAT coverage.
---

# Scaffold a BA+TOTP Playwright UAT harness

Drops in a complete e2e harness driven by Better Auth's HTTP endpoints. The
harness signs in via `/api/auth/sign-in/email`, completes TOTP via
`/api/auth/two-factor/verify-totp`, and materialises a Playwright
`storageState` so every authenticated spec starts past the auth + TOTP gates.
No production code is modified.

If the target project does NOT match the BA+TOTP pattern, stop and suggest
the looser `uat-harness` skill instead.

## Prerequisites — verify before scaffolding

Read the target repo and confirm all of the following. If any is missing,
stop and explain what's missing — do not partially scaffold.

1. `better-auth` is in `dependencies` (any 1.x version).
2. The BA config file (`src/services/auth/config.ts`, `src/lib/auth.ts`,
   `auth.ts`, similar) instantiates `betterAuth(...)` with the `twoFactor`
   plugin from `better-auth/plugins`.
3. There is a `dev` script in `package.json` and an `APP_URL` reference in
   `.env.local.example` (or equivalent). The dev port is whatever the `dev`
   script binds to.
4. There is a bootstrap step that creates a known admin user with a known
   password (e.g. `db:bootstrap`, `db:seed`). Read the bootstrap script and
   note the email + password it uses. If the credentials are env-driven, note
   the env var names instead.
5. Mandatory TOTP enforcement exists somewhere (typically Next.js middleware
   redirecting unauthenticated/un-TOTP'd sessions). Search for `totp` and
   `two_factor` in middleware/services to confirm.

## Discovery — gather these values

- `APP_URL` — from `.env.local.example` or the dev script port.
- Test admin email + password — from the bootstrap script. Use these as
  defaults in `.env.local.example` so operators can override later.
- Whether `tsconfig.json` already excludes `e2e` (likely no — add it).
- Whether `.mcp.json` already exists at the repo root — if yes, plan to merge
  rather than overwrite.

## Files to create — copy verbatim from this skill's `templates/` dir

Skill base path: `~/.claude/skills/ba-totp-uat-harness/templates/`

- `e2e/README.md`
- `e2e/fixture-init.ts`
- `e2e/global-setup.ts`
- `e2e/playwright.config.ts`
- `e2e/specs/health.public.spec.ts`
- `e2e/specs/auth-smoke.admin.spec.ts`
- `.mcp.json` — only if the target has none. If one exists, add the
  `playwright` server entry to it without disturbing other servers.

The templates are project-agnostic — they read every value from `process.env`
and require no edits. Do not introduce hardcoded credentials.

## Files to modify

- `package.json`:
  - Add `@playwright/test` and `otplib` to `devDependencies` (versions in
    `templates/package-snippet.json`).
  - Add scripts: `test:fixture-init`, `e2e`, `e2e:ui` (also in the snippet).
- `tsconfig.json`: add `"e2e"` to the `exclude` array. Playwright handles its
  own type compilation.
- `.gitignore`: append the contents of `templates/gitignore-snippet.txt`.
- `.env.local.example`: append the contents of `templates/env-snippet.txt`,
  substituting the test admin email/password defaults you discovered above.

## Verification

1. Read each file you created and confirm there are no `{{PLACEHOLDER}}`
   strings or stray references to `forqsite`/`dev@forqsite.test`/port 6020.
2. Tell the operator the run sequence:
   ```
   pnpm install
   pnpm exec playwright install chromium
   pnpm <bootstrap-script>      # whatever creates the test admin
   pnpm dev                      # in another terminal
   pnpm test:fixture-init        # one-time TOTP enrolment via BA
   pnpm e2e
   ```
3. Do NOT run any commands yourself. The operator runs them.

## Invariants — must survive any project-specific edits

These come from production-tested workarounds for BA quirks. Removing them
will cause silent test failures that are hard to diagnose.

1. Every cookie-bearing POST sends `Origin: ${APP_URL}`. BA's origin-check
   middleware returns 403 FORBIDDEN otherwise.
2. Calls go to BA HTTP routes (`/api/auth/...`), not `auth.api.*`. The
   internal API path discards Set-Cookie headers from `setSessionCookie()`,
   so the session cookie never reaches Playwright.
3. Cookie values are stored in `storageState` verbatim (wire format, NOT
   `decodeURIComponent`'d). Playwright forwards values literally; decoding
   would double-encode BA's HMAC-signed cookies on the wire.

## When the project diverges

- If BA endpoints are mounted under a non-default prefix (e.g. `/auth/`
  instead of `/api/auth/`), edit the URL constants in `fixture-init.ts` and
  `global-setup.ts` to match. Keep all three invariants intact.
- If TOTP is configured but NOT enforced (operators can opt out), this skill
  still works — `fixture-init` will enrol TOTP for the test user even when
  it's optional.
- If the bootstrap script uses env vars for admin creds rather than
  hardcoded values, set the same env vars in `.env.local.example` so the
  fixture-init script reads them too.
- If the project already has an `e2e/` directory: stop and ask. Do not
  overwrite.
