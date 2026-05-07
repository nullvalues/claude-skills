---
name: uat-harness
description: Scaffold a Playwright UAT harness for any web app, with a pluggable auth-driver pattern. Use when a project has authenticated routes (any auth stack — Better Auth, Auth.js, NextAuth, Lucia, custom sessions) and you need browser-based UAT coverage that drives the real auth flow rather than mocking it. Discover the auth stack, pick or write a driver that satisfies the AuthDriver interface, and scaffold the rest around it.
---

# Scaffold a Playwright UAT harness with a pluggable auth driver

The generic harness ships:
- `playwright.config.ts` — public + admin projects, webServer auto-start
- `global-setup.ts` — calls `driver.authenticate()` and serialises the
  cookie jar into Playwright `storageState`
- `fixture-init.ts` — calls `driver.initFixture()` for one-time setup
- `auth-driver.types.ts` — the `AuthDriver` interface
- `auth-driver.ts` — re-exports the driver implementation chosen for this
  project
- two seed specs — public health check + authenticated session smoke

All auth-specific logic lives in a single driver module. This skill picks
from the canonical drivers in `templates/auth-drivers/` or writes a new one
when the project's stack is novel.

If the project is plainly Next.js + Better Auth + the twoFactor plugin, use
the `ba-totp-uat-harness` skill instead — it is faster and has fewer moving
parts.

## Step 1 — Discover the auth stack

Read the target repo:

1. `package.json` dependencies. Match against:
   - `better-auth` → BA driver (TOTP variant if `twoFactor` plugin appears
     in the auth config)
   - `next-auth` / `@auth/...` → Auth.js driver
   - `lucia` → Lucia driver
   - `iron-session` / custom JWT — write a custom driver
2. Auth route handlers — `app/api/auth/...` or `pages/api/auth/...`. The
   path patterns confirm the library and reveal any non-default mounting.
3. Auth config files — `auth.ts`, `lib/auth.ts`, `services/auth/...`.
4. Whether MFA is enforced — search for `totp`, `twoFactor`, `mfa`,
   `verify-otp`, `webauthn`. Note whether middleware blocks unauthenticated
   or un-MFA'd sessions.
5. How the test user is created — bootstrap script, seed file, signup form,
   manual setup. The driver's `initFixture()` needs to make this idempotent.

If discovery is unambiguous and matches a canonical driver, proceed to
Step 2 with that driver. If unclear, ask the operator three questions
before continuing:

- Which auth library is in use?
- Is MFA enforced for the test user, and if so what kind (TOTP, WebAuthn,
  email OTP)?
- How should the test user be created (script name, signup endpoint,
  manual)?

## Step 2 — Pick or write a driver

Skill base path: `~/.claude/skills/uat-harness/templates/auth-drivers/`

Canonical drivers:
- `better-auth-totp.ts` — Better Auth + twoFactor (TOTP enforced).
  Persists secret to `e2e/.env.fixture`.
- (Add more here as you build them — Auth.js credentials, Lucia, etc.)

If a canonical driver matches the project's stack, copy it to
`e2e/auth-driver.ts`. If a project-specific quirk needs handling (non-default
endpoint paths, additional headers, CSRF tokens), edit the copy.

If no canonical driver matches, write one (Step 3).

## Step 3 — Writing a custom driver

The driver implements the `AuthDriver` interface from
`templates/e2e/auth-driver.types.ts`:

```ts
export interface AuthDriver {
  /**
   * Idempotent. Ensures the test user exists with predictable credentials
   * and any required MFA materialised. Persists derived secrets (TOTP seed,
   * WebAuthn key, etc.) to e2e/.env.fixture.
   *
   * Throws with an actionable remedy on conflict (e.g. "user is already
   * MFA-enrolled but our secret is missing — reset the DB and re-bootstrap").
   */
  initFixture(): Promise<void>

  /**
   * Performs a fresh sign-in (called once per test invocation). Returns
   * the accumulated Set-Cookie headers and the cookie host. Drive the auth
   * API directly via fetch — do not reach into the auth library's internal
   * API, since internal calls often discard cookies.
   */
  authenticate(): Promise<{ setCookies: string[]; host: string }>
}
```

Implementation rules:

- Read configuration from `process.env`. Fail loudly if env vars are
  missing — never use hardcoded defaults that mask configuration errors.
- Drive the auth library's HTTP endpoints. Do NOT call its internal API.
- Mirror any project-specific invariants from the production auth code
  (read auth helpers and replicate quirks like Origin headers, CSRF tokens,
  signed-cookie wire format).
- Return Set-Cookie headers verbatim. `global-setup.ts` handles parsing
  into Playwright cookie format.
- For MFA: persist the secret to `e2e/.env.fixture` on first enrolment.
  Subsequent runs read it and compute fresh codes.

Once written, place the driver at `e2e/auth-driver.ts` (default export) or
in a per-project file imported from there.

## Step 4 — Scaffold the rest

Copy verbatim from `templates/e2e/`:

- `e2e/README.md`
- `e2e/auth-driver.types.ts`
- `e2e/fixture-init.ts` (generic; calls `driver.initFixture()`)
- `e2e/global-setup.ts` (generic; calls `driver.authenticate()`, parses
  cookies, writes storageState)
- `e2e/playwright.config.ts`
- `e2e/specs/health.public.spec.ts`
- `e2e/specs/auth-smoke.admin.spec.ts`
- `.mcp.json` (or merge into existing)

## Step 5 — Modify config files

- `package.json` — devDeps + scripts (see `templates/package-snippet.json`).
  Add MFA library deps if the chosen driver needs them (e.g. `otplib` for
  TOTP).
- `tsconfig.json` — add `"e2e"` to the `exclude` array.
- `.gitignore` — append `templates/gitignore-snippet.txt`.
- `.env.local.example` — append `templates/env-snippet.txt`. Add any
  additional vars the driver requires.

## Step 6 — Verification

1. Confirm no `{{PLACEHOLDER}}` strings remain.
2. Read the driver and confirm it follows the implementation rules above.
3. Show the operator the run sequence:
   ```
   pnpm install
   pnpm exec playwright install chromium
   pnpm <bootstrap-script>     # whatever creates the test user
   pnpm dev                     # in another terminal
   pnpm test:fixture-init       # one-time MFA enrolment / setup
   pnpm e2e
   ```
4. Do NOT run anything yourself.

## When the project diverges

- If the project's auth flow needs more than two HTTP calls (e.g. CSRF
  preflight + sign-in + MFA + post-MFA confirm), implement all of them
  inside `authenticate()`. The harness only sees the final cookie jar.
- If the project uses bearer tokens instead of cookies, return a
  pseudo-cookie called `Authorization` and add a `request.use(...)` hook in
  the admin Playwright project. Document the deviation in the driver's
  header comment.
- If the project has separate admin and tenant auth (e.g. multi-tenant
  with sub-tenant cookies), write two drivers and add a third Playwright
  project for the tenant flow.

## Adding a canonical driver

When a custom driver proves stable across two or more projects, promote it
to `templates/auth-drivers/` so the next user of this skill can pick it
without writing one. Update the "canonical drivers" list in this SKILL.md.
