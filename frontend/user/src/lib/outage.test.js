import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, clearSession, getAccessToken, setSession } from './api.js'
import { getOutageState, resetOutageState, retryNow, RETRY_BACKOFF_MS } from './outage.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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

/** fetch router: `health` answers GET /health, `api` everything else. */
function stubFetch({ api, health }) {
  const mock = vi.fn(async (input) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      if (health instanceof Error) throw health
      return health()
    }
    if (api instanceof Error) throw api
    return api()
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const networkDown = new TypeError('failed to fetch')

/** nextRetryAt is booked a microtask away from Date.now() — allow jitter. */
function expectNextRetryIn(gap) {
  const delta = getOutageState().nextRetryAt - Date.now()
  expect(delta).toBeGreaterThanOrEqual(gap - 5)
  expect(delta).toBeLessThanOrEqual(gap + 5)
}

function seedSession() {
  setSession({
    user: { id: 'u1', email: 'user@example.com', role: 'CUSTOMER', name: 'User' },
    accessToken: 'access-1',
  })
}

/** Run one failed request (network error or 5xx) and let its health check land. */
async function failedCall() {
  await apiFetch('/x').catch(() => {})
  await vi.advanceTimersByTimeAsync(1)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('localStorage', memoryStorage())
  resetOutageState()
  clearSession()
})

afterEach(() => {
  resetOutageState()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('outage trigger rules', () => {
  it.each([400, 401, 403, 404, 409])(
    'a %i answer never triggers the screen (the server is alive)',
    async (status) => {
      stubFetch({ api: () => jsonResponse(status, { error: {} }), health: () => jsonResponse(200) })
      await apiFetch('/x').catch(() => {})
      await vi.advanceTimersByTimeAsync(1)
      expect(getOutageState().active).toBe(false)

      // And it left no residue: even one later real failure stays under the
      // two-check threshold.
      stubFetch({ api: networkDown, health: networkDown })
      await failedCall()
      expect(getOutageState().active).toBe(false)
    },
  )

  it('an aborted request never triggers the screen', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    const mock = stubFetch({ api: abort, health: () => jsonResponse(200) })
    await apiFetch('/x').catch(() => {})
    await vi.advanceTimersByTimeAsync(1)
    expect(getOutageState().active).toBe(false)
    // The abort is the caller's own cancellation: no health probe even runs.
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('a single failed call never shows the screen', async () => {
    stubFetch({ api: networkDown, health: networkDown })
    await failedCall()
    expect(getOutageState().active).toBe(false)
  })

  it('two consecutive failed checks (network + health) show the screen', async () => {
    stubFetch({ api: networkDown, health: networkDown })
    await failedCall()
    await failedCall()
    expect(getOutageState().active).toBe(true)
  })

  it('5xx failures count like network errors', async () => {
    stubFetch({
      api: () => jsonResponse(503, { error: { code: 'INTERNAL' } }),
      health: () => jsonResponse(500),
    })
    await failedCall()
    await failedCall()
    expect(getOutageState().active).toBe(true)
  })

  it('a success between failures breaks the streak', async () => {
    stubFetch({ api: networkDown, health: networkDown })
    await failedCall()
    stubFetch({ api: () => jsonResponse(200, { data: {} }), health: () => jsonResponse(200) })
    await apiFetch('/x')
    stubFetch({ api: networkDown, health: networkDown })
    await failedCall()
    expect(getOutageState().active).toBe(false)
  })

  it('two parallel failed calls reach two checks (queued probe)', async () => {
    stubFetch({ api: networkDown, health: networkDown })
    await Promise.all([apiFetch('/a').catch(() => {}), apiFetch('/b').catch(() => {})])
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getOutageState().active).toBe(true)
  })
})

describe('retry backoff and recovery', () => {
  async function reachOutage() {
    stubFetch({ api: networkDown, health: networkDown })
    await failedCall()
    await failedCall()
    expect(getOutageState().active).toBe(true)
  }

  it('automatic retry backs off 5s, 10s, 20s, then 30s and stays there', async () => {
    await reachOutage()
    // Outage activation schedules the first retry at +5s.
    expectNextRetryIn(RETRY_BACKOFF_MS[0])

    // Each step fires the scheduled check (which fails) and books the next.
    const steps = [[5000, 10000], [10000, 20000], [20000, 30000], [30000, 30000]]
    for (const [advance, nextGap] of steps) {
      await vi.advanceTimersByTimeAsync(advance)
      expect(getOutageState().active).toBe(true)
      expectNextRetryIn(nextGap)
    }
  })

  it('recovery dismisses the screen and keeps the session', async () => {
    seedSession()
    await reachOutage()
    stubFetch({ api: () => jsonResponse(200, { data: {} }), health: () => jsonResponse(200) })
    await vi.advanceTimersByTimeAsync(5000) // automatic retry succeeds
    expect(getOutageState().active).toBe(false)
    expect(getOutageState().recoveryTick).toBe(1)
    // Never clear the session on outage.
    expect(getAccessToken()).toBe('access-1')
  })

  it('the Try again button checks immediately and restarts the backoff at 5s', async () => {
    await reachOutage()
    await vi.advanceTimersByTimeAsync(5000) // scheduled check fails -> next 10s
    expectNextRetryIn(10000)

    stubFetch({ api: networkDown, health: networkDown })
    const checking = retryNow()
    await checking
    await vi.advanceTimersByTimeAsync(1)
    expect(getOutageState().active).toBe(true)
    // Manual retry restarts the sequence at 5s.
    expectNextRetryIn(5000)
  })

  it('Try again recovers and dismisses immediately', async () => {
    seedSession()
    await reachOutage()
    stubFetch({ api: () => jsonResponse(200, { data: {} }), health: () => jsonResponse(200) })
    await retryNow()
    await vi.advanceTimersByTimeAsync(1)
    expect(getOutageState().active).toBe(false)
    expect(getOutageState().recoveryTick).toBe(1)
    expect(getAccessToken()).toBe('access-1')
  })

  it('a successful public GET is content for the slim-banner rule', async () => {
    stubFetch({ api: () => jsonResponse(200, { data: { services: [] } }), health: () => jsonResponse(200) })
    await apiFetch('/services?limit=100')
    expect(getOutageState().hasContent).toBe(true)
  })
})
