import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  AuthError,
  ConflictError,
  NetworkError,
  ServerError,
  ValidationError,
  apiFetch,
  clearSession,
  fetchMatching,
  fetchTeam,
  getAccessToken,
  hasAuthHint,
  setSession,
  sessionDispositionAfter401,
  tryRefresh,
} from './api.js'
import { resetOutageState } from './outage.js'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function seedSession(role = 'CUSTOMER') {
  setSession({ user: { id: 'u1', email: 'user@example.com', role, name: 'User' }, accessToken: 'access-1' })
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  // The node test environment ships no web storage; the hint flag needs one.
  vi.stubGlobal('localStorage', memoryStorage())
  clearSession()
  // Failure-path tests feed the outage detector; don't leak streaks between
  // tests.
  resetOutageState()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('error mapping', () => {
  it('maps 400/409/500/network to typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Bad input', details: { rating: 'Required' } } })))
    const validation = await apiFetch('/x').catch((e) => e)
    expect(validation).toBeInstanceOf(ValidationError)
    expect(validation.details).toEqual({ rating: 'Required' })

    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, { error: { code: 'CONFLICT', message: 'already reviewed' } })))
    const conflict = await apiFetch('/x').catch((e) => e)
    expect(conflict).toBeInstanceOf(ConflictError)
    expect(conflict).toBeInstanceOf(ApiError)

    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(500, { error: { code: 'INTERNAL', message: 'boom' } })))
    const server = await apiFetch('/x').catch((e) => e)
    expect(server).toBeInstanceOf(ServerError)
    expect(server.status).toBe(500)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch') }))
    const network = await apiFetch('/x').catch((e) => e)
    expect(network).toBeInstanceOf(NetworkError)
    expect(network.kind).toBe('network')
  })

  it('never logs tokens', async () => {
    const spy = vi.spyOn(console, 'log')
    seedSession()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { ok: true } })))
    await expect(apiFetch('/x')).resolves.toEqual({ ok: true })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('401 -> refresh once -> retry once', () => {
  it('refresh then retry succeeds', async () => {
    seedSession('CUSTOMER')
    const calls = []
    const fetchMock = vi.fn(async (input, init) => {
      calls.push({ url: String(input), auth: (init.headers || {}).Authorization })
      if (calls.length === 1) return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })
      if (String(input).includes('/auth/refresh')) {
        return jsonResponse(200, { data: { accessToken: 'access-2' } })
      }
      return jsonResponse(200, { data: { ok: true } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/appointments/mine?page=1')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // The retry carries the NEW access token.
    expect(calls[2].auth).toBe('Bearer access-2')
    expect(getAccessToken()).toBe('access-2')
    await expect(sessionDispositionAfter401('CUSTOMER')).resolves.toBe('keep')
  })

  it('refresh failure with 401 clears the session (FE-01)', async () => {
    seedSession('CUSTOMER')
    const fetchMock = vi.fn(async (input) => {
      if (String(input).includes('/auth/refresh')) {
        return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } })
      }
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiFetch('/appointments/mine').catch((e) => e)
    expect(error).toBeInstanceOf(AuthError)
    const disposition = await sessionDispositionAfter401('CUSTOMER')
    expect(disposition).toBe('clear')
    // resolveAuthFailure('clear') drops the in-memory session and the hint.
    if (disposition === 'clear') clearSession()
    expect(getAccessToken()).toBeNull()
    expect(hasAuthHint()).toBe(false)
  })

  it('staff wrong-role 401 keeps the session (FE-01)', async () => {
    seedSession('STAFF')
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (String(input).includes('/auth/refresh')) {
        return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } })
      }
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Access denied. Required roles: CUSTOMER' } })
    }))

    const error = await apiFetch('/reviews', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(AuthError)
    await expect(sessionDispositionAfter401('STAFF')).resolves.toBe('keep')
    expect(getAccessToken()).toBe('access-1')
    expect(hasAuthHint()).toBe(true)
  })

  it('network failure keeps the session (FE-01)', async () => {
    seedSession('CUSTOMER')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch') }))

    const error = await apiFetch('/appointments/mine').catch((e) => e)
    expect(error).toBeInstanceOf(NetworkError)
    await expect(sessionDispositionAfter401('CUSTOMER')).resolves.toBe('keep')
    expect(getAccessToken()).toBe('access-1')
  })

  it('5xx on the refresh probe keeps the session (FE-01)', async () => {
    seedSession('CUSTOMER')
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (String(input).includes('/auth/refresh')) {
        return jsonResponse(500, { error: { code: 'INTERNAL', message: 'boom' } })
      }
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })
    }))

    const error = await apiFetch('/appointments/mine').catch((e) => e)
    expect(error).toBeInstanceOf(AuthError)
    await expect(sessionDispositionAfter401('CUSTOMER')).resolves.toBe('keep')
    expect(getAccessToken()).toBe('access-1')
  })
})

describe('silent refresh', () => {
  it('stores the rotated access token and keeps the hint', async () => {
    seedSession('CUSTOMER')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { accessToken: 'access-2' } })))
    await expect(tryRefresh()).resolves.toBe(true)
    expect(getAccessToken()).toBe('access-2')
    expect(hasAuthHint()).toBe(true)
  })

  it('a refresh without a cookie reports unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } })))
    await expect(tryRefresh()).resolves.toBe(false)
    await expect(sessionDispositionAfter401('CUSTOMER')).resolves.toBe('clear')
    await expect(sessionDispositionAfter401('MANAGER')).resolves.toBe('keep')
  })
})

describe('team and matching endpoints', () => {
  it('fetchTeam calls the public roster endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { staff: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const data = await fetchTeam()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/staff/team')
    expect(data).toEqual({ staff: [] })
  })

  it('fetchMatching sends serviceIds, date and startTime', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { recommended: null, alternatives: [], reason: '', partial: true, covers: 0, needed: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchMatching({ serviceIds: ['s1', 's2'], date: '2026-11-02', startTime: '14:00' })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/matching')
    expect(url.searchParams.get('serviceIds')).toBe('s1,s2')
    expect(url.searchParams.get('date')).toBe('2026-11-02')
    expect(url.searchParams.get('startTime')).toBe('14:00')
  })
})
