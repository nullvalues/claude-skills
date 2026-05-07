/**
 * Playwright global setup — generic across auth stacks.
 *
 * Calls driver.authenticate(), parses Set-Cookie response headers into
 * Playwright cookie format, and writes e2e/.auth/admin.json. Drivers
 * supply only the auth flow; this file owns cookie serialisation.
 */
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'
import driver from './auth-driver'

interface PWCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

interface StorageState {
  cookies: PWCookie[]
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
}

function parseSetCookieToPWCookie(raw: string, defaultDomain: string): PWCookie | null {
  const parts = raw.split(';').map((p) => p.trim())
  const nameValue = parts[0]
  const eqIdx = nameValue.indexOf('=')
  if (eqIdx === -1) return null
  const name = nameValue.slice(0, eqIdx)
  // Keep the wire-format value verbatim. Playwright sends the cookie value as-is
  // in Cookie headers, so URL-decoding it here would break signed cookies that
  // were encodeURIComponent'd by the auth library.
  const value = nameValue.slice(eqIdx + 1)

  const cookie: PWCookie = {
    name,
    value,
    domain: defaultDomain,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }

  for (const attr of parts.slice(1)) {
    const lower = attr.toLowerCase()
    if (lower === 'httponly') cookie.httpOnly = true
    else if (lower === 'secure') cookie.secure = true
    else if (lower.startsWith('samesite=')) {
      const sv = lower.slice(9)
      if (sv === 'strict') cookie.sameSite = 'Strict'
      else if (sv === 'lax') cookie.sameSite = 'Lax'
      else if (sv === 'none') cookie.sameSite = 'None'
    } else if (lower.startsWith('max-age=')) {
      const n = parseInt(attr.slice(8), 10)
      if (!isNaN(n)) cookie.expires = Math.floor(Date.now() / 1000) + n
    } else if (lower.startsWith('expires=')) {
      const t = Date.parse(attr.slice(8))
      if (!isNaN(t)) cookie.expires = Math.floor(t / 1000)
    } else if (lower.startsWith('path=')) {
      cookie.path = attr.slice(5)
    } else if (lower.startsWith('domain=')) {
      cookie.domain = attr.slice(7)
    }
  }

  return cookie
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('[global-setup] Calling driver.authenticate()...')
  const { setCookies, host } = await driver.authenticate()

  if (setCookies.length === 0) {
    throw new Error('[global-setup] driver.authenticate() returned no Set-Cookie headers — auth flow did not produce a session.')
  }

  const cookieMap = new Map<string, PWCookie>()
  for (const raw of setCookies) {
    const parsed = parseSetCookieToPWCookie(raw, host)
    // Map key includes domain+path+name so later cookies (e.g. session
    // replacing a challenge cookie) overwrite earlier ones cleanly.
    if (parsed) cookieMap.set(`${parsed.domain}:${parsed.path}:${parsed.name}`, parsed)
  }

  const storage: StorageState = { cookies: Array.from(cookieMap.values()), origins: [] }
  const outPath = path.resolve(__dirname, '.auth', 'admin.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(storage, null, 2), { encoding: 'utf8', mode: 0o600 })
  console.log(`[global-setup] Wrote storage state with ${storage.cookies.length} cookie(s) to ${outPath}`)
}
