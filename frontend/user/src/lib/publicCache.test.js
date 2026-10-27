// Public catalogue cache contract (lib/api.js): account-independent data is
// served from memory across view navigations, stale values are revalidated
// quietly past the fresh window, mutations drop the affected pages, and
// sign-out wipes everything so no value can leak into the next session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  fetchReviewList,
  fetchServices,
  submitReviewRequest,
} from './api.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('localStorage', {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null },
    setItem(key, value) { this.store.set(key, value) },
    removeItem(key) { this.store.delete(key) },
  })
  fetchMock = vi.fn(async (url) => {
    const path = String(url)
    if (path.includes('/reviews')) return jsonResponse(200, { data: { reviews: ['fresh-reviews'] } })
    return jsonResponse(200, { data: { services: ['fresh-services'] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  clearSession()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearSession()
})

describe('public catalogue cache', () => {
  it('serves repeated navigation from memory with a single request', async () => {
    const first = await fetchServices()
    const second = await fetchServices()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('answers from the stale value while revalidating after the fresh window', async () => {
    const first = await fetchServices()
    vi.setSystemTime(Date.now() + 61_000)
    const stale = await fetchServices()
    expect(stale).toBe(first) // immediate, no waiting on the network
    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops every cached value on sign-out', async () => {
    await fetchServices()
    clearSession()
    await fetchServices()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops the gallery pages when a new review is posted', async () => {
    await fetchReviewList()
    fetchMock.mockImplementation(async (url, init = {}) => {
      if (init.method === 'POST') return jsonResponse(201, { data: { id: 'r1' } })
      return jsonResponse(200, { data: { reviews: ['fresh-reviews'] } })
    })
    await submitReviewRequest({ comment: 'QA fixture review' })
    await fetchReviewList()
    expect(fetchMock).toHaveBeenCalledTimes(3) // GET, POST, GET again
  })
})
