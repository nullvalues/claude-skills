import { expect, test } from '@playwright/test'

test.describe('public — health endpoint', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })
})
