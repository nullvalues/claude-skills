/**
 * AuthDriver — the contract every project-specific driver must satisfy.
 *
 * The harness's generic pieces (fixture-init.ts, global-setup.ts) call only
 * these two methods. Everything auth-specific — endpoint URLs, request
 * shapes, MFA handling, idempotency rules — lives behind this interface.
 *
 * Drivers should:
 *   - read configuration from process.env (fail loudly on missing values)
 *   - drive the auth API over HTTP, never the library's internal API
 *   - return Set-Cookie headers verbatim from the response
 *   - persist any derived secrets (TOTP seed, etc.) to e2e/.env.fixture
 */
export interface AuthDriver {
  /**
   * Idempotent one-time setup. Ensures the test user exists with
   * predictable credentials and any required MFA materialised. Persists
   * derived secrets (e.g. TOTP seed) to e2e/.env.fixture.
   *
   * Throws with an actionable remedy on conflict — for example, when a
   * user already has MFA enrolled but our fixture file is missing.
   */
  initFixture(): Promise<void>

  /**
   * Performs a fresh sign-in (every test invocation). Returns the
   * accumulated Set-Cookie response headers and the cookie host (used by
   * global-setup to default the cookie domain field).
   *
   * If sign-in requires multiple HTTP calls (CSRF preflight, sign-in,
   * MFA verify, etc.), do all of them here and return the final cookie
   * set. The harness sees only the result.
   */
  authenticate(): Promise<{ setCookies: string[]; host: string }>
}
