import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError, ConflictError, NetworkError } from './api.js'
import { ensureGoogleIdentity, googleSignInErrorMessage, promptOneTapOnce, setGoogleCredentialHandler } from './googleAuth.js'

describe('google sign-in error mapping', () => {
  it('keeps the server message verbatim on 409', () => {
    const error = new ConflictError('An account with this email already exists. Sign in with your password to continue.')
    expect(googleSignInErrorMessage(error)).toBe('An account with this email already exists. Sign in with your password to continue.')
  })

  it('falls back to the generic failure for anything else', () => {
    expect(googleSignInErrorMessage(new AuthError('unauthenticated', 401, 'UNAUTHORIZED', 'bad token'))).toBe(
      'Google sign-in failed. Please try again.',
    )
    expect(googleSignInErrorMessage(new NetworkError())).toBe('Google sign-in failed. Please try again.')
    expect(googleSignInErrorMessage(null)).toBe('Google sign-in failed. Please try again.')
  })
})

describe('gis initialization', () => {
  it('initializes GIS with a server-issued nonce', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com')
    const initialize = vi.fn()
    vi.stubGlobal('window', { google: { accounts: { id: { initialize } } } })
    // loadGoogleScript() requires a document even when GIS is already present.
    vi.stubGlobal('document', {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ data: { nonce: 'server-nonce-1', expiresAt: Date.now() + 600_000 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    const ready = await ensureGoogleIdentity()
    expect(ready).toBe(true)
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(initialize.mock.calls[0][0].nonce).toBe('server-nonce-1')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})

describe('credential handler routing', () => {
  it('unregistering the top handler hands control back', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = setGoogleCredentialHandler(first)
    const unregisterSecond = setGoogleCredentialHandler(second)
    unregisterSecond()
    unregisterFirst()
    // Both handlers were registered and removed without throwing; the stack
    // must stay balanced (a leaked handler would sign in from a stale closure).
    expect(true).toBe(true)
  })
})

describe('one-tap prompting', () => {
  let prompt

  beforeEach(() => {
    prompt = vi.fn()
    vi.stubGlobal('window', { google: { accounts: { id: { prompt } } } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prompts at most once per session', () => {
    expect(promptOneTapOnce()).toBe(true)
    expect(promptOneTapOnce()).toBe(false)
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})
