# e2e — Playwright UAT harness (Better Auth + TOTP)

Browser-driven UAT tests authored against the live application. The harness
drives Better Auth's HTTP endpoints directly so tests prove the production
auth pipeline rather than mocking around it.

## One-time setup

Prereqs: the application's runtime services (database, object store, etc.)
running, `.env.local` populated with `APP_URL`, `TEST_ADMIN_EMAIL`,
`TEST_ADMIN_PASSWORD`, and `/etc/hosts` (or DNS) pointing the platform
hostname at the local machine.

```bash
pnpm install
pnpm exec playwright install chromium

pnpm <bootstrap-script>    # whatever creates the test admin user
pnpm dev                   # in another terminal
pnpm test:fixture-init     # enrols TOTP for the admin via BA; writes e2e/.env.fixture
```

After that, `pnpm e2e` is repeatable.

## Layout

```
e2e/
├── playwright.config.ts        — projects: public + admin
├── global-setup.ts             — sign-in + verify-totp; produces .auth/admin.json
├── fixture-init.ts             — one-time TOTP enrolment driver
└── specs/
    ├── *.public.spec.ts        — no auth, no storage state
    └── *.admin.spec.ts         — uses .auth/admin.json
```

## How auth works

1. `fixture-init` signs in as the test admin, calls
   `POST /api/auth/two-factor/enable`, parses the secret out of the
   `otpauth://` URI it returns, generates a code with `otplib` and submits
   it to `POST /api/auth/two-factor/verify-totp`. The secret lands in
   `e2e/.env.fixture` (gitignored).
2. `globalSetup` re-signs in for every test invocation, computes the
   current TOTP code, calls `verify-totp`, and serialises the cookie jar
   into `e2e/.auth/admin.json` in Playwright `storageState` format.
3. The `admin` Playwright project loads that storage state, so every
   `*.admin.spec.ts` starts already past the TOTP gate.

## Recovering after a database reset

Reset clears the user, so the TOTP secret on file no longer matches anything
on the server. Recover with: re-run the bootstrap script, then re-run
`pnpm test:fixture-init`.

If `fixture-init` reports "TOTP is already enrolled but `e2e/.env.fixture`
is missing", the user record exists but the secret is gone — same recovery.

## Adding a spec

* Public path → `e2e/specs/<name>.public.spec.ts`. No auth, no storage state.
* Admin path → `e2e/specs/<name>.admin.spec.ts`. Inherits the test admin's
  session via storage state.

Drive the page with `page.goto`, `page.click`, etc. Assertions go through
`expect(...)`. To exercise an API route directly, use the `request` fixture
which rides the same auth context.
