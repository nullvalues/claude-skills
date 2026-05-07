import { expect, test } from '@playwright/test'

/**
 * End-to-end proof that globalSetup produced a real, authenticated session.
 * Uses Better Auth's get-session endpoint (the same one the middleware calls
 * to resolve the user) so this asserts the production auth pipeline.
 */
test.describe('admin — authenticated session smoke', () => {
  test('BA get-session returns the test admin user', async ({ request }) => {
    const res = await request.get('/api/auth/get-session')
    expect(res.status()).toBe(200)

    const body = (await res.json()) as { user?: { email?: string } } | null
    const expectedEmail = process.env.TEST_ADMIN_EMAIL
    if (!expectedEmail) throw new Error('TEST_ADMIN_EMAIL not set in env at test time')

    expect(body?.user?.email).toBe(expectedEmail)
  })

  test('GET /admin reaches the page (no /totp redirect)', async ({ page }) => {
    // After verify-totp the user is past the TOTP gate; the admin index
    // either renders or redirects to a project-specific authenticated route —
    // but it must NOT redirect to /totp/setup or /totp/verify or /login.
    // Those redirects are the canary for "auth half-worked".
    const res = await page.goto('/admin')
    expect(res?.status()).toBeLessThan(500)
    expect(page.url()).not.toMatch(/\/totp\/(setup|verify)/)
    expect(page.url()).not.toMatch(/\/login/)
  })
})
