import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'

// Load .env.local first (operator-managed), then e2e/.env.fixture (driver-managed)
// so that any persisted MFA secrets are visible to global-setup and individual
// specs without the operator having to merge files by hand.
const repoRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.resolve(repoRoot, '.env.local') })
const fixturePath = path.resolve(__dirname, '.env.fixture')
if (fs.existsSync(fixturePath)) {
  dotenv.config({ path: fixturePath, override: false })
}

const APP_URL = process.env.APP_URL
if (!APP_URL) {
  throw new Error('APP_URL is required (set in .env.local). Cannot configure Playwright without it.')
}

const STORAGE_STATE = path.resolve(__dirname, '.auth', 'admin.json')

export default defineConfig({
  testDir: path.resolve(__dirname, 'specs'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve(__dirname, 'global-setup.ts'),

  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'public',
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testMatch: /.*\.admin\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
  ],

  webServer: process.env.E2E_REUSE_SERVER === '1'
    ? undefined
    : {
        command: 'pnpm dev',
        cwd: repoRoot,
        url: `${APP_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
