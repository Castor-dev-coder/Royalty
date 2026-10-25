// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingFlow from './BookingFlow.jsx'
import { resetOutageState } from '../lib/outage.js'
import { manilaTodayIso } from '../lib/hours.js'

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

// Mon–Sat 09:00–18:00, Sunday closed (dayOfWeek 1..7 as the live API sends).
const OPEN_HOURS = [
  ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    id: `h${dayOfWeek}`,
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isOpen: true,
  })),
  { id: 'h7', dayOfWeek: 7, openTime: null, closeTime: null, isOpen: false },
]

function withDayClosed(dayOfWeek) {
  return OPEN_HOURS.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, isOpen: false } : row))
}

// The next date strictly after Manila today with the given weekday
// (0=Sunday..6=Saturday) — always bookable under the future rule.
function nextWeekday(weekday) {
  const [year, month, day] = manilaTodayIso().split('-').map(Number)
  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const date = new Date(Date.UTC(year, month - 1, day + ahead))
    if (date.getUTCDay() === weekday) return date.toISOString().slice(0, 10)
  }
  return null
}

const openDay = nextWeekday(1) // a Monday, 09:00–18:00
const closedDay = nextWeekday(0) // a Sunday, closed

function stubApi({
  matching,
  eligible = [staffEntry('e1', 'Eligible', 'One')],
  onPost,
  matchingUrls,
  hoursResponses,
  postError,
} = {}) {
  let hoursCall = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init = {}) => {
      const url = String(input)
      if (url.includes('/staff/eligible')) return jsonResponse(200, { data: { staff: eligible } })
      if (url.includes('/schedules/business-hours')) {
        const queue = hoursResponses ?? [OPEN_HOURS]
        const rows = queue[Math.min(hoursCall, queue.length - 1)]
        hoursCall += 1
        return jsonResponse(200, { data: { businessHours: rows } })
      }
      if (url.includes('/matching')) {
        matchingUrls?.push(url)
        return jsonResponse(200, { data: matching })
      }
      if (url.includes('/appointments') && init.method === 'POST') {
        if (postError) return jsonResponse(postError.status, postError.body)
        onPost?.(JSON.parse(init.body))
        return jsonResponse(201, { data: { appointment: { appointmentCode: 'ROY-1' } } })
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND' } })
    }),
  )
}

async function fillSlot(date = openDay, time = '14:00') {
  fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: date } })
  fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
  fireEvent.click(await screen.findByRole('button', { name: time }))
}

// Picks a slot and waits for the auto-recommended stylist ('m1') to land.
async function fillSlotWithRecommendation(date = openDay, time = '14:00') {
  await fillSlot(date, time)
  await waitFor(() => expect(screen.getByLabelText(/preferred stylist/i).value).toBe('m1'))
}

function renderFlow(overrides = {}) {
  render(
    <BookingFlow
      service={{ ...service, ...overrides }}
      user={{ name: 'Tester' }}
      onClose={() => {}}
    />,
  )
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
    await fillSlot()
    const select = screen.getByLabelText(/preferred stylist/i)
    await waitFor(() => expect(select.value).toBe('m1'))
    expect(screen.getByText('Covers all 1 category · staff rating 4.5 · 1 booking that day')).toBeTruthy()
    // Matching is asked for this exact slot and service.
    expect(matchingUrls.length).toBeGreaterThan(0)
    const params = new URL(matchingUrls[0]).searchParams
    expect(params.get('serviceIds')).toBe('s1')
    expect(params.get('date')).toBe(openDay)
    expect(params.get('startTime')).toBe('14:00')

    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toEqual({
      staffId: 'm1',
      appointmentDate: openDay,
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
    await fillSlot()
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
    await fillSlot()
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
    await fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].staffId).toBe('a1')
  })
})

describe('BookingFlow — shop-hours slot picker (A3)', () => {
  it('offers only slots where the whole appointment fits inside opening hours', async () => {
    stubApi({ matching: { recommended: staffEntry('m1', 'Mia', 'Reco'), alternatives: [], reason: '', partial: false, covers: 1, needed: 1 } })
    // 90-minute service: 16:30 is the last start (ends exactly at 18:00).
    renderFlow({ durationMinutes: 90 })
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    expect(await screen.findByRole('button', { name: '16:30' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '17:00' })).toBeNull()
    expect(screen.queryByRole('button', { name: '18:00' })).toBeNull()
    expect(screen.queryByRole('button', { name: '08:30' })).toBeNull()
    expect(screen.getByRole('button', { name: '09:00' })).toBeTruthy()
  })

  it('shows "Closed on <Weekday>" and no slots for a closed day', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: closedDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    expect(await screen.findByText('Closed on Sunday')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '09:00' })).toBeNull()
  })

  it('re-fetches shop hours whenever the picker opens', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    await screen.findByRole('button', { name: '14:00' })
    fireEvent.click(screen.getByRole('button', { name: '14:00' })) // closes the picker
    fireEvent.click(screen.getByRole('button', { name: /^time$/i })) // re-open
    await screen.findByRole('button', { name: '14:00' })
  })
})

describe('BookingFlow — pre-submit re-check (A6)', () => {
  it('blocks the submit with the specific reason when the slot went bad', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [],
        reason: 'Covers all 1 category',
        partial: false,
        covers: 1,
        needed: 1,
      },
      onPost: (body) => posts.push(body),
      // Third fetch (just before the POST) reports Monday closed.
      hoursResponses: [OPEN_HOURS, OPEN_HOURS, withDayClosed(1)],
    })
    renderFlow()
    await fillSlotWithRecommendation(nextWeekday(1), '14:00')
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText('The salon is closed on Monday.')).toBeTruthy())
    expect(posts.length).toBe(0)
    expect(screen.queryByText(/appointment summary/i)).toBeTruthy() // still on review
  })
})

describe('BookingFlow — booking error text (A2)', () => {
  it('maps a staffId detail to the stylist prompt', async () => {
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [],
        reason: '',
        partial: false,
        covers: 1,
        needed: 1,
      },
      postError: {
        status: 400,
        body: {
          error: {
            code: 'BAD_REQUEST',
            message: 'staffId must be a UUID',
            details: [{ path: 'staffId', message: 'staffId must be a UUID' }],
          },
        },
      },
    })
    renderFlow()
    await fillSlotWithRecommendation()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText('Please choose a stylist before booking.')).toBeTruthy())
  })

  it("shows the server's message verbatim", async () => {
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [],
        reason: '',
        partial: false,
        covers: 1,
        needed: 1,
      },
      postError: {
        status: 400,
        body: {
          error: {
            code: 'BAD_REQUEST',
            message: 'The salon opens at 09:00 on Monday.',
            details: [{ path: 'appointmentDate', message: 'too early' }],
          },
        },
      },
    })
    renderFlow()
    await fillSlotWithRecommendation()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText('The salon opens at 09:00 on Monday.')).toBeTruthy())
    expect(screen.queryByText('Please choose a valid date and time during opening hours.')).toBeNull()
  })
})
