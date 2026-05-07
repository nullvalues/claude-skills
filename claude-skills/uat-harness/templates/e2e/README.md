# e2e — Playwright UAT harness (pluggable auth driver)

Browser-driven UAT tests. The harness drives the project's real auth flow
through HTTP endpoints, materialises a Playwright `storageState`, and runs
specs against the live application — no auth mocking.

The auth-specific logic lives in `auth-driver.ts`. Everything else is
generic.

## One-time setup

Prereqs: runtime services running, `.env.local` populated with `APP_URL`,
`TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, and any driver-specific vars.

```bash
pnpm install
pnpm exec playwright install chromium

pnpm <bootstrap-script>    # whatever creates the test admin user
pnpm dev                   # in another terminal
pnpm test:fixture-init     # one-time setup (driver.initFixture)
```

Then `pnpm e2e` is repeatable.

## Layout

```
e2e/
├── playwright.config.ts        — projects: public + admin
├── global-setup.ts             — calls driver.authenticate; writes storageState
├── fixture-init.ts             — calls driver.initFixture
├── auth-driver.ts              — project-specific implementation
├── auth-driver.types.ts        — the AuthDriver interface
└── specs/
    ├── *.public.spec.ts        — no auth, no storage state
    └── *.admin.spec.ts         — uses .auth/admin.json
```

## How auth works

1. `fixture-init` calls `driver.initFixture()` once. The driver creates
   the test user (if needed), enrols MFA (if needed), and persists any
   derived secrets to `e2e/.env.fixture`.
2. `globalSetup` calls `driver.authenticate()` for every test invocation.
   The driver returns Set-Cookie response headers; this layer parses them
   into Playwright cookie format and writes `e2e/.auth/admin.json`.
3. The `admin` Playwright project loads that storage state, so every
   `*.admin.spec.ts` starts authenticated.

## Recovering after a state reset

Re-run the bootstrap script, then `pnpm test:fixture-init`. The driver
should be idempotent and recreate any state it needs.

## Adding a spec

* Public path → `e2e/specs/<name>.public.spec.ts`. No auth.
* Admin path → `e2e/specs/<name>.admin.spec.ts`. Inherits the test
  user's session.

## Swapping drivers

Replace `auth-driver.ts` with a different implementation. The harness's
generic pieces never need to change. See the `uat-harness` skill in
`~/.claude/skills/uat-harness/templates/auth-drivers/` for canonical
driver implementations.
