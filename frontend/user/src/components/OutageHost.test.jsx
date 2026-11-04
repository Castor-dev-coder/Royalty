// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OutageHost from './OutageHost.jsx'
import { apiFetch, clearSession, getAccessToken, setSession } from '../lib/api.js'
import { getOutageState, resetOutageState } from '../lib/outage.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch({ api, health }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = String(input)
      if (url.endsWith('/health')) {
        if (health instanceof Error) throw health
        return health()
      }
      if (api instanceof Error) throw api
      return api()
    }),
  )
}

const networkDown = new TypeError('failed to fetch')

async function reachOutage() {
  stubFetch({ api: networkDown, health: networkDown })
  await apiFetch('/x').catch(() => {})
  await apiFetch('/x').catch(() => {})
  await waitFor(() => expect(getOutageState().active).toBe(true))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetOutageState()
  clearSession()
})

afterEach(() => {
  // Vitest runs without globals, so RTL's auto-cleanup never registers —
  // unmount explicitly or renders pile up across tests.
  cleanup()
  resetOutageState()
  vi.unstubAllGlobals()
})

describe('OutageHost', () => {
  it('shows nothing for 401/403 answers (wrong-role still means "no access")', async () => {
    stubFetch({ api: () => jsonResponse(403, { error: { code: 'NO_ACCESS' } }), health: () => jsonResponse(200) })
    render(
      <MemoryRouter initialEntries={['/appointments']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await apiFetch('/x').catch(() => {})
    await apiFetch('/x').catch(() => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/right back/i)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the full-page screen when the first load fails', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await reachOutage()
    await waitFor(() => expect(screen.getByText(/right back/i)).toBeTruthy())
    expect(screen.getByRole('alert')).toBeTruthy()
    const button = screen.getByRole('button', { name: /try again/i })
    expect(button).toBeTruthy()
    // Visitor-facing copy only: no error codes or stack traces.
    const text = screen.getByRole('alert').parentElement.textContent
    expect(text).not.toMatch(/5\d\d|TypeError|NETWORK_ERROR|stack/i)
    // Countdown and last-checked are present.
    expect(screen.getByText(/automatic retry in \d+s/i)).toBeTruthy()
    expect(screen.getByText(/last checked/i)).toBeTruthy()
  })

  it('keeps loaded public content under the slim banner', async () => {
    stubFetch({ api: () => jsonResponse(200, { data: { services: [] } }), health: () => jsonResponse(200) })
    render(
      <MemoryRouter initialEntries={['/']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await apiFetch('/services?limit=100') // public data is now on screen
    await reachOutage()
    await waitFor(() => expect(screen.getByText(/connection lost/i)).toBeTruthy())
    expect(screen.queryByText(/right back/i)).toBeNull()
  })

  it('uses the full-page screen on a protected view even with content loaded', async () => {
    stubFetch({ api: () => jsonResponse(200, { data: {} }), health: () => jsonResponse(200) })
    render(
      <MemoryRouter initialEntries={['/appointments']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await apiFetch('/appointments/mine')
    await reachOutage()
    await waitFor(() => expect(screen.getByText(/right back/i)).toBeTruthy())
  })

  it('the Try again button works and recovery keeps the session', async () => {
    setSession({
      user: { id: 'u1', email: 'user@example.com', role: 'CUSTOMER', name: 'User' },
      accessToken: 'access-1',
    })
    render(
      <MemoryRouter initialEntries={['/']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await reachOutage()
    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy())

    stubFetch({ api: () => jsonResponse(200, { data: {} }), health: () => jsonResponse(200) })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.queryByText(/right back/i)).toBeNull())
    expect(getOutageState().active).toBe(false)
    expect(getOutageState().recoveryTick).toBe(1)
    // Never clear the session on outage.
    expect(getAccessToken()).toBe('access-1')
  })

  it('a lone failure shows nothing (module and UI agree)', async () => {
    stubFetch({ api: networkDown, health: networkDown })
    render(
      <MemoryRouter initialEntries={['/']}>
        <OutageHost />
      </MemoryRouter>,
    )
    await apiFetch('/x').catch(() => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/right back/i)).toBeNull()
    expect(screen.queryByText(/connection lost/i)).toBeNull()
    expect(getOutageState().active).toBe(false)
  })
})
