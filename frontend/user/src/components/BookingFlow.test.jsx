// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingFlow from './BookingFlow.jsx'
import { resetOutageState } from '../lib/outage.js'

const service = { id: 's1', name: 'Signature Haircut', durationMinutes: 60, price: 500 }

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function staffEntry(id, firstName, lastName, extra = {}) {
  return {
    id,
    firstName,
    lastName,
    photoUrl: null,
    position: 'Stylist',
    primaryRole: 'STYLIST',
    avgStaffRating: null,
    bookingsToday: 0,
    coversCategories: 1,
    coversAll: true,
    ...extra,
  }
}

function stubApi({ matching, eligible = [staffEntry('e1', 'Eligible', 'One')], onPost, matchingUrls } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init = {}) => {
      const url = String(input)
      if (url.includes('/staff/eligible')) return jsonResponse(200, { data: { staff: eligible } })
      if (url.includes('/matching')) {
        matchingUrls?.push(url)
        return jsonResponse(200, { data: matching })
      }
      if (url.includes('/appointments') && init.method === 'POST') {
        onPost?.(JSON.parse(init.body))
        return jsonResponse(201, { data: { appointment: { appointmentCode: 'ROY-1' } } })
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND' } })
    }),
  )
}

function fillSlot() {
  fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-11-02' } })
  fireEvent.change(screen.getByLabelText(/^time$/i), { target: { value: '14:00' } })
}

function renderFlow() {
  render(<BookingFlow service={service} user={{ name: 'Tester' }} onClose={() => {}} />)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetOutageState()
  // Reduced motion: steps swap instantly instead of waiting for the swipe.
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BookingFlow — slot matching', () => {
  it('auto-selects the recommendation with its reason; No preference sends it', async () => {
    const posts = []
    const matchingUrls = []
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [staffEntry('a1', 'Alan', 'Alt')],
        reason: 'Covers all 1 category · staff rating 4.5 · 1 booking that day',
        partial: false,
        covers: 1,
        needed: 1,
      },
      onPost: (body) => posts.push(body),
      matchingUrls,
    })
    renderFlow()
    fillSlot()
    const select = screen.getByLabelText(/preferred stylist/i)
    await waitFor(() => expect(select.value).toBe('m1'))
    expect(screen.getByText('Covers all 1 category · staff rating 4.5 · 1 booking that day')).toBeTruthy()
    // Matching is asked for this exact slot and service.
    expect(matchingUrls.length).toBeGreaterThan(0)
    const params = new URL(matchingUrls[0]).searchParams
    expect(params.get('serviceIds')).toBe('s1')
    expect(params.get('date')).toBe('2026-11-02')
    expect(params.get('startTime')).toBe('14:00')

    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toEqual({
      staffId: 'm1',
      appointmentDate: '2026-11-02',
      startTime: '14:00',
      serviceIds: ['s1'],
    })
  })

  it('Change stylist expands labeled alternatives and posts the manual pick', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [
          staffEntry('a1', 'Alan', 'Alt', {
            coversAll: false,
            coversCategories: 1,
            avgStaffRating: 4.2,
            bookingsToday: 2,
          }),
        ],
        reason: 'Covers all 2 categories · staff rating 4.8',
        partial: false,
        covers: 2,
        needed: 2,
      },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /change stylist/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /change stylist/i }))
    // 'covers X of Y' for a partial coverer, plus rating and bookings.
    expect(screen.getByText(/covers 1 of 2/)).toBeTruthy()
    expect(screen.getByText(/staff rating 4\.2 · 2 bookings that day/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /alan alt/i }))
    const select = screen.getByLabelText(/preferred stylist/i)
    await waitFor(() => expect(select.value).toBe('a1'))

    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    expect(screen.getByText(/Stylist: Alan Alt/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].staffId).toBe('a1')
  })

  it('never auto-selects a partial match and blocks No preference with nobody available', async () => {
    stubApi({
      matching: {
        recommended: null,
        alternatives: [],
        reason: 'No stylist covers every category for this slot.',
        partial: true,
        covers: 1,
        needed: 2,
      },
    })
    renderFlow()
    fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy())
    // Eligible staff exist, but a partial match must not be auto-selected.
    const select = screen.getByLabelText(/preferred stylist/i)
    expect(select.value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    expect(screen.getByText('No stylist is available for this slot')).toBeTruthy()
    expect(screen.queryByText(/appointment summary/i)).toBeNull()
  })

  it('No preference falls back to the first alternative when there is no recommendation', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: null,
        alternatives: [staffEntry('a1', 'Alan', 'Alt', { coversAll: false, coversCategories: 1 })],
        reason: 'No stylist covers every category for this slot.',
        partial: true,
        covers: 1,
        needed: 2,
      },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].staffId).toBe('a1')
  })
})
