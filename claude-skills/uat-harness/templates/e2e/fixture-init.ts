/**
 * Generic fixture-init entry point.
 *
 * The auth-specific work is implemented inside the project's chosen driver
 * (e2e/auth-driver.ts). This file is intentionally tiny — keep it that way
 * so different auth stacks reuse it unmodified.
 */
/* eslint-disable no-console */

import driver from './auth-driver'

async function main(): Promise<void> {
  console.log('[fixture-init] Calling driver.initFixture()...')
  await driver.initFixture()
  console.log('[fixture-init] Done. Run `pnpm e2e` to execute the suite.')
}

main().catch((err: unknown) => {
  console.error('[fixture-init] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
