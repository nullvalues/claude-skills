import { expect, test } from '@playwright/test'

/**
 * End-to-end proof that globalSetup produced an authenticated session.
 *
 * The exact assertion depends on the auth stack. Adapt these to whatever
 * the project exposes:
 *   - Better Auth: GET /api/auth/get-session returns { user: { email } }
 *   - Auth.js / NextAuth: GET /api/auth/session returns { user: { email } }
 *   - Lucia: a project-specific endpoint that validates the session cookie
 *   - Custom: hit any authenticated endpoint and assert the response shape
 *
 * Replace the URL and shape below to match the project before relying on
 * this spec as a CI signal.
 */
test.describe('admin — authenticated session smoke', () => {
  test('session endpoint returns the test admin user', async ({ request }) => {
    // TODO: replace with the project's session endpoint
    const res = await request.get('/api/auth/get-session')
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { user?: { email?: string } } | null
    const expectedEmail = process.env.TEST_ADMIN_EMAIL
    if (!expectedEmail) throw new Error('TEST_ADMIN_EMAIL not set in env at test time')

    expect(body?.user?.email).toBe(expectedEmail)
  })

  test('GET /admin reaches the page (no /login or /mfa redirect)', async ({ page }) => {
    const res = await page.goto('/admin')
    expect(res?.status()).toBeLessThan(500)
    expect(page.url()).not.toMatch(/\/login/)
    // Adapt this regex if the project's MFA path differs
    expect(page.url()).not.toMatch(/\/(totp|mfa|two-factor)\//)
  })
})
