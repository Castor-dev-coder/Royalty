// Session persistence contract for the hybrid auth client (lib/api.js):
// silent restore exchanges the httpOnly refresh cookie with cookie-mode
// headers, a protected 401 triggers exactly one refresh + retry, and the
// sign-out revokes the server session. No token ever touches web storage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiFetch,
  clearSession,
  getAccessToken,
  hasAuthHint,
  loginRequest,
  logoutRequest,
  tryRefresh,
} from './api.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  // jsdom-less environment: provide the web storage the hint flag uses.
  vi.stubGlobal('localStorage', {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null },
    setItem(key, value) { this.store.set(key, value) },
    removeItem(key) { this.store.delete(key) },
  })
  clearSession()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('silent session restore', () => {
  it('uses the cookie-mode refresh call and keeps the new token in memory only', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return jsonResponse(200, { data: { accessToken: 'fresh-access' } })
    }))
    await expect(tryRefresh()).resolves.toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/auth\/refresh$/)
    expect(calls[0].init.credentials).toBe('include')
    expect(calls[0].init.headers['X-Auth-Mode']).toBe('cookie')
    expect(calls[0].init.headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(getAccessToken()).toBe('fresh-access')
    expect(hasAuthHint()).toBe(true)
  })

  it('reports a failed restore without touching any stored state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })))
    await expect(tryRefresh()).resolves.toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(hasAuthHint()).toBe(false)
  })

  it('shares one in-flight refresh between concurrent callers (rotating tokens)', async () => {
    let resolveFetch
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveFetch = () => resolve(jsonResponse(200, { data: { accessToken: 'fresh-access' } }))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const first = tryRefresh()
    const second = tryRefresh()
    resolveFetch()
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('401 handling', () => {
  it('refreshes once and retries the call with the new token', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const entry = { url: String(url), headers: init.headers ?? {} }
      calls.push(entry)
      if (/\/auth\/refresh$/.test(entry.url)) return jsonResponse(200, { data: { accessToken: 'fresh-access' } })
      if (calls.length === 1) return jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })
      return jsonResponse(200, { data: { ok: true } })
    }))
    const result = await apiFetch('/appointments/mine')
    expect(result).toEqual({ ok: true })
    expect(calls.map((call) => call.url)).toEqual([
      expect.stringContaining('/appointments/mine'),
      expect.stringContaining('/auth/refresh'),
      expect.stringContaining('/appointments/mine'),
    ])
    const retried = calls[2].headers.Authorization ?? ''
    expect(retried).toContain('fresh-access')
  })

  it('never retries auth endpoints', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiFetch('/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('sign-in and sign-out', () => {
  it('signs in with the cookie-mode header and passes Remember me through', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return jsonResponse(200, { data: { id: '1', email: 'qa@example.com', role: 'CUSTOMER', accessToken: 'access' } })
    }))
    await loginRequest('qa@example.com', 'secret123', true)
    expect(calls[0].init.headers['X-Auth-Mode']).toBe('cookie')
    expect(JSON.parse(calls[0].init.body)).toEqual({ email: 'qa@example.com', password: 'secret123', rememberMe: true })
  })

  it('omits rememberMe from the request body when unchecked', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ init })
      return jsonResponse(200, { data: { id: '1', email: 'qa@example.com', role: 'CUSTOMER', accessToken: 'access' } })
    }))
    await loginRequest('qa@example.com', 'secret123', false)
    expect(JSON.parse(calls[0].init.body)).toEqual({ email: 'qa@example.com', password: 'secret123' })
  })

  it('signs out server-side (cookie revocation) and clears the memory session', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    }))
    await loginRequest('qa@example.com', 'secret123', true).catch(() => {})
    await logoutRequest()
    const logout = calls.at(-1)
    expect(logout.url).toMatch(/\/auth\/logout$/)
    expect(logout.init.credentials).toBe('include')
    expect(logout.init.headers['X-Auth-Mode']).toBe('cookie')
    expect(logout.init.headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(getAccessToken()).toBeNull()
    expect(hasAuthHint()).toBe(false)
  })
})
