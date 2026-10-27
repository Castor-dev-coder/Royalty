// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingFlow from './BookingFlow.jsx'
import { ToastContext } from '../context/toast-context.js'
import { invalidatePublicCache } from '../lib/api.js'
import { resetOutageState } from '../lib/outage.js'
import { manilaMonthEndIso, manilaTodayIso } from '../lib/hours.js'

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

// Frozen before the module-level fixtures are computed so openDay/closedDay
// stay inside the current-month booking window (2026-10-12 = a Monday).
vi.setSystemTime(new Date('2026-10-12T01:16:00Z'))
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
        return jsonResponse(201, { data: { appointment: { id: 'appt-1', appointmentCode: 'ROY-1' } } })
      }
      if (url.includes('/payments/quote/')) {
        return jsonResponse(200, {
          data: {
            appointmentId: 'appt-1',
            totalAmount: '250',
            verifiedTotal: '0',
            outstanding: '250',
            options: [{ key: 'FULL', amount: '250' }, { key: 'DOWN', amount: '100' }],
            settings: { configured: true, downPaymentKind: 'PERCENT', downPaymentValue: 40, receiverName: 'QA Receiver' },
          },
        })
      }
      if (url.includes('/payments/settings')) {
        return jsonResponse(200, { data: { settings: { configured: true, downPaymentKind: 'PERCENT', downPaymentValue: 40 } } })
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
    <ToastContext.Provider value={{ showToast: () => {} }}>
      <BookingFlow
        service={{ ...service, ...overrides }}
        user={{ name: 'Tester' }}
        onClose={() => {}}
      />
    </ToastContext.Provider>,
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
  invalidatePublicCache()
  resetOutageState()
  // Frozen to a Monday mid-month so "next weekday" fixtures stay inside the
  // current-month booking window in any real-world month (2026-10-12 09:16
  // Manila). The suite stays deterministic as the real clock moves.
  vi.setSystemTime(new Date('2026-10-12T01:16:00Z'))
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
  vi.useRealTimers()
})

describe('BookingFlow — booking window', () => {
  it('bounds the date picker to the current Manila calendar month', async () => {
    stubApi({})
    renderFlow()
    const dateInput = screen.getByLabelText(/^date$/i)
    expect(dateInput.min).toBe(manilaTodayIso())
    expect(dateInput.max).toBe(manilaMonthEndIso())
    expect(screen.getByText(/bookings are open for .* only/i)).toBeTruthy()
  })

  it('will not submit a date outside the current Manila month', async () => {
    stubApi({})
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-11-18' } })
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    expect(screen.queryByText(/appointment summary/i)).toBeNull()
  })
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
          staffEntry('a2', 'Ava', 'Full', { coversAll: true, coversCategories: 2 }),
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

    fireEvent.click(screen.getByRole('button', { name: /ava full/i }))
    const select = screen.getByLabelText(/preferred stylist/i)
    await waitFor(() => expect(select.value).toBe('a2'))

    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    expect(screen.getByText(/Stylist: Ava Full/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].staffId).toBe('a2')
  })

  it('never auto-selects a partial match and lets review proceed but never confirms with nobody available', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: null,
        alternatives: [],
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
    // Eligible staff exist, but a partial match must not be auto-selected.
    const select = screen.getByLabelText(/preferred stylist/i)
    expect(select.value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    // Unresolvable staff never traps the modal: the customer reaches review
    // with the problem spelled out, but confirming is blocked and nothing is
    // posted.
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    expect(screen.getByText(/no stylist is available for this slot yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText(/no stylist covers every category/i)).toBeTruthy())
    expect(posts.length).toBe(0)
    expect(screen.queryByText(/reference:/i)).toBeNull()
  })

  it('No preference falls back to the first alternative when there is no recommendation', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: null,
        alternatives: [staffEntry('a1', 'Alan', 'Alt', { coversAll: true, coversCategories: 2 })],
        reason: 'No stylist covers every category for this slot.',
        partial: true,
        covers: 2,
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

  it('renders partial-coverage staff disabled with a reason and never selects them', async () => {
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
    await waitFor(() => expect(screen.getByRole('button', { name: /change stylist/i })).toBeTruthy())
    // Nobody covers every category: the customer is told plainly.
    expect(screen.getByText(/no staff are available for this date and time/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /change stylist/i }))
    // The partial alternative is visible with its reason but not selectable.
    const partialButton = screen.getByRole('button', { name: /Alan Alt/i })
    expect(partialButton.disabled).toBe(true)
    expect(screen.getAllByText(/does not cover all selected services/i).length).toBeGreaterThan(0)
    fireEvent.click(partialButton)
    const select = screen.getByLabelText(/preferred stylist/i)
    expect(select.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    // The flow is never trapped, and confirming stays blocked.
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText(/choose a stylist before booking|no stylist/i)).toBeTruthy())
    expect(posts.length).toBe(0)
    expect(screen.queryByText(/reference:/i)).toBeNull()
  })

  it('shows a truthful pay-at-salon result with no payment claims', async () => {
    const posts = []
    stubApi({
      matching: { recommended: staffEntry('m1', 'Mia', 'Reco'), alternatives: [], reason: '', partial: false, covers: 1, needed: 1 },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    await fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText(/payment is due at the salon/i)).toBeTruthy())
    // The result must never claim a received or verified payment.
    expect(screen.getByText(/payment: due at the salon/i)).toBeTruthy()
    expect(screen.queryByText(/awaiting proof/i)).toBeNull()
    expect(screen.queryByText(/successfully booked/i)).toBeNull()
  })

  it('shows an awaiting-proof result for GCash until the proof is submitted', async () => {
    const posts = []
    stubApi({
      matching: { recommended: staffEntry('m1', 'Mia', 'Reco'), alternatives: [], reason: '', partial: false, covers: 1, needed: 1 },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    await fillSlot()
    await waitFor(() => expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    const gcashFull = screen.getByRole('button', { name: /gcash: pay in full/i })
    expect(gcashFull.disabled).toBe(false)
    fireEvent.click(gcashFull)
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText(/reserved pending payment/i)).toBeTruthy())
    // Not completed-looking before any proof exists.
    expect(screen.getByText(/payment: awaiting proof submission/i)).toBeTruthy()
    expect(screen.queryByText(/payment: due at the salon/i)).toBeNull()
    expect(screen.getByRole('button', { name: /open payment window/i })).toBeTruthy()
    expect(posts.length).toBe(1)
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
