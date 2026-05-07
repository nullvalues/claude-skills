/**
 * Playwright global setup — populates e2e/.auth/admin.json with a session
 * cookie obtained by driving the real Better Auth endpoints.
 *
 * Sequence:
 *   1. POST /api/auth/sign-in/email   → BA returns twoFactorRedirect: true and
 *                                       sets the `two_factor` challenge cookie.
 *   2. Compute current TOTP code from TEST_ADMIN_TOTP_SECRET.
 *   3. POST /api/auth/two-factor/verify-totp → BA replaces the two_factor
 *                                              cookie with a real session cookie.
 *   4. Persist the resulting cookie jar as a Playwright storageState file.
 *
 * If the user has not run `pnpm test:fixture-init` yet (no secret on file)
 * we abort with a clear instruction rather than silently skipping auth.
 */
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'
import { authenticator } from 'otplib'
import type { FullConfig } from '@playwright/test'

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

function setCookieHeaders(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((raw) => raw.split(';', 1)[0]?.trim())
    .filter((s): s is string => Boolean(s))
    .join('; ')
}

function parseSetCookieToPWCookie(raw: string, defaultDomain: string): PWCookie | null {
  const parts = raw.split(';').map((p) => p.trim())
  const nameValue = parts[0]
  const eqIdx = nameValue.indexOf('=')
  if (eqIdx === -1) return null
  const name = nameValue.slice(0, eqIdx)
  // Keep the wire-format value verbatim. Playwright sends the cookie value as-is
  // in Cookie headers, so URL-decoding it here would break BA's signed cookies
  // (which are encodeURIComponent'd by setSessionCookie).
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

async function signIn(appUrl: string, email: string, password: string): Promise<{ setCookies: string[]; twoFactorChallenge: boolean }> {
  const res = await fetch(`${appUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': appUrl,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BA sign-in/email failed: HTTP ${res.status}. Response: ${text}`)
  }

  let body: unknown = null
  try { body = await res.json() } catch { /* empty body acceptable */ }

  const twoFactorChallenge =
    typeof body === 'object' && body !== null && (body as { twoFactorRedirect?: boolean }).twoFactorRedirect === true

  return { setCookies: setCookieHeaders(res), twoFactorChallenge }
}

async function verifyTotp(appUrl: string, code: string, cookieHeader: string): Promise<string[]> {
  const res = await fetch(`${appUrl}/api/auth/two-factor/verify-totp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': appUrl,
      'Accept': 'application/json',
      'Cookie': cookieHeader,
    },
    body: JSON.stringify({ code }),
    redirect: 'manual',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BA verify-totp failed: HTTP ${res.status}. Response: ${text}`)
  }
  return setCookieHeaders(res)
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const appUrl = process.env.APP_URL
  const email = process.env.TEST_ADMIN_EMAIL
  const password = process.env.TEST_ADMIN_PASSWORD
  const secret = process.env.TEST_ADMIN_TOTP_SECRET

  if (!appUrl) throw new Error('[global-setup] APP_URL is required (set in .env.local).')
  if (!email) throw new Error('[global-setup] TEST_ADMIN_EMAIL is required (set in .env.local).')
  if (!password) throw new Error('[global-setup] TEST_ADMIN_PASSWORD is required (set in .env.local).')
  if (!secret) {
    throw new Error(
      '[global-setup] TEST_ADMIN_TOTP_SECRET is missing.\n' +
      'Run `pnpm test:fixture-init` once after the bootstrap step to enrol TOTP for the test admin.',
    )
  }

  console.log(`[global-setup] Signing in ${email} at ${appUrl}`)
  const signin = await signIn(appUrl, email, password)
  const signinCookieHeader = cookieHeaderFromSetCookies(signin.setCookies)

  if (!signin.twoFactorChallenge) {
    throw new Error(
      '[global-setup] sign-in did not return a TOTP challenge.\n' +
      'This means the test admin user has no TOTP enrolled — middleware would' +
      ' bounce every request to /totp/setup. Run `pnpm test:fixture-init`.',
    )
  }

  authenticator.options = { window: 1 }
  const code = authenticator.generate(secret)
  console.log('[global-setup] Submitting TOTP code')
  const verifyCookies = await verifyTotp(appUrl, code, signinCookieHeader)

  const host = new URL(appUrl).hostname
  const allSetCookies = [...signin.setCookies, ...verifyCookies]
  const cookieMap = new Map<string, PWCookie>()
  for (const raw of allSetCookies) {
    const parsed = parseSetCookieToPWCookie(raw, host)
    if (parsed) cookieMap.set(`${parsed.domain}:${parsed.path}:${parsed.name}`, parsed)
  }

  const storage: StorageState = { cookies: Array.from(cookieMap.values()), origins: [] }
  const outPath = path.resolve(__dirname, '.auth', 'admin.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(storage, null, 2), { encoding: 'utf8', mode: 0o600 })
  console.log(`[global-setup] Wrote storage state with ${storage.cookies.length} cookie(s) to ${outPath}`)
}
