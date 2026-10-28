// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingFlow from './BookingFlow.jsx'
import { ToastContext } from '../context/toast-context.js'
import { invalidatePublicCache } from '../lib/api.js'
import { resetOutageState } from '../lib/outage.js'
import { bookingWindowEndIso, formatTime12, manilaTodayIso } from '../lib/hours.js'

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
// stay deterministic (2026-10-12 = a Monday).
vi.setSystemTime(new Date('2026-10-12T01:16:00Z'))
const openDay = nextWeekday(1) // a Monday, 09:00–18:00
const closedDay = nextWeekday(0) // a Sunday, closed

const NO_STAFF = {
  recommended: null,
  alternatives: [],
  reason: 'No stylist covers every category for this slot.',
  partial: true,
  covers: 0,
  needed: 1,
}
const M1_MATCH = {
  recommended: staffEntry('m1', 'Mia', 'Reco'),
  alternatives: [],
  reason: 'Covers all 1 category',
  partial: false,
  covers: 1,
  needed: 1,
}

function stubApi({
  matching = M1_MATCH,
  matchingDelayMs = 0,
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
        // A function matcher receives the requested start time so a test can
        // make one slot bookable and another staffed by nobody.
        const startTime = new URL(url).searchParams.get('startTime') ?? ''
        const payload = typeof matching === 'function' ? matching(startTime) : matching
        if (matchingDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, matchingDelayMs))
        return jsonResponse(200, { data: payload })
      }
      if (url.includes('/appointments') && init.method === 'POST') {
        if (postError) return jsonResponse(postError.status, postError.body)
        onPost?.(JSON.parse(init.body))
        return jsonResponse(201, { data: { appointment: { id: 'appt-1', appointmentCode: 'ROY-1' } } })
      }
      if (url.includes('/payments/maya/checkout')) {
        return jsonResponse(201, { data: { payment: { id: 'maya-1', status: 'PENDING', outstanding: 250, paidTotal: 0, checkoutUrl: 'https://maya.test/pay' } } })
      }
      if (url.includes('/payments/maya/')) {
        return jsonResponse(200, { data: { payment: { id: 'maya-1', status: 'PENDING', outstanding: 250, paidTotal: 0 } } })
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

// Picks a date and a slot; slots start 'checking' (disabled) until the
// per-slot availability probe finishes, so the click waits for them.
async function fillSlot(date = openDay, time = '14:00') {
  fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: date } })
  fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
  const slotButton = await screen.findByRole('button', { name: formatTime12(time) })
  await waitFor(() => expect(slotButton.disabled).toBe(false))
  fireEvent.click(slotButton)
}

// Picks a slot and EXPLICITLY selects a stylist from the available list —
// nothing is ever auto-selected.
async function fillSlotAndPick(date = openDay, time = '14:00', stylistName = /Mia Reco/) {
  await fillSlot(date, time)
  const stylistButton = await screen.findByRole('button', { name: stylistName })
  fireEvent.click(stylistButton)
  await waitFor(() => expect(stylistButton.getAttribute('aria-pressed')).toBe('true'))
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
  // booking window in any real-world month (2026-10-12 09:16 Manila).
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

describe('BookingFlow — booking window (three months)', () => {
  it('bounds the date picker to today and the three-month window', () => {
    stubApi()
    renderFlow()
    const dateInput = screen.getByLabelText(/^date$/i)
    expect(dateInput.min).toBe(manilaTodayIso())
    expect(dateInput.max).toBe(bookingWindowEndIso())
    expect(screen.getByText(/bookings are open for the next three months/i)).toBeTruthy()
  })

  it('accepts a later month inside the window and shows its slots', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-11-16' } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeTruthy()
    expect(screen.getByLabelText(/^date$/i).value).toBe('2026-11-16')
  })

  it('rejects a date outside the window with a message and keeps the field clear', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2027-03-01' } })
    expect(await screen.findByText(/outside the booking window/i)).toBeTruthy()
    expect(screen.getByLabelText(/^date$/i).value).toBe('')
  })

  it('rejects a closed day once the hours are known', async () => {
    stubApi()
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /^time$/i })) // loads hours
    await screen.findByText(/pick a date/i)
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: closedDay } })
    expect(await screen.findByText(/The salon is closed on Sunday\. Please choose another day\./i)).toBeTruthy()
    expect(screen.getByLabelText(/^date$/i).value).toBe('')
  })
})

describe('BookingFlow — slot availability (12-hour display)', () => {
  it('disables and grays slots no stylist can staff', async () => {
    stubApi({ matching: (startTime) => (startTime === '14:00' ? NO_STAFF : M1_MATCH) })
    renderFlow()
    await fillSlot(openDay, '09:00')
    // The picker stays open after the pick — assert the grid in place.
    const unavailable = await screen.findByRole('button', { name: '2:00 PM' })
    await waitFor(() => expect(unavailable.disabled).toBe(true))
    expect(unavailable.className).toContain('opacity-60')
    expect(unavailable.getAttribute('title')).toContain('No stylist is available')
    expect(screen.getByText('Grayed times have no stylist available.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '9:00 AM' }).disabled).toBe(false)
  })

  it('offers only slots where the whole appointment fits inside opening hours', async () => {
    stubApi()
    renderFlow({ durationMinutes: 90 })
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    // 90-minute service: 4:30 PM is the last start (ends exactly at 18:00).
    expect(await screen.findByRole('button', { name: '4:30 PM' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '5:00 PM' })).toBeNull()
    expect(screen.queryByRole('button', { name: '6:00 PM' })).toBeNull()
    expect(screen.queryByRole('button', { name: '8:30 AM' })).toBeNull()
    expect(screen.getByRole('button', { name: '9:00 AM' })).toBeTruthy()
  })

  it('shows "Closed on <Weekday>" and no slots for a closed day picked before hours load', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: closedDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    expect(await screen.findByText('Closed on Sunday')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '9:00 AM' })).toBeNull()
  })

  it('re-fetches shop hours whenever the picker opens', async () => {
    stubApi()
    renderFlow()
    await fillSlot()
    // Close and reopen the picker: opening re-fetches shop hours.
    fireEvent.click(screen.getByRole('button', { name: /^time$/i })) // close
    fireEvent.click(screen.getByRole('button', { name: /^time$/i })) // re-open
    await screen.findByRole('button', { name: '2:00 PM' })
  })

  it('keeps the picker open after a time is selected so the stylist list is reachable', async () => {
    stubApi()
    renderFlow()
    await fillSlot(openDay, '14:00')
    expect(document.getElementById('booking-slot-picker')).toBeTruthy()
    expect(screen.getByRole('button', { name: '2:00 PM' }).getAttribute('aria-pressed')).toBe('true') // selected slot stays visible
    // The Preferred Stylist section is exposed right below the open picker.
    await screen.findByRole('button', { name: /Mia Reco/ })
  })

  it('allows selecting a time while availability is still being checked', async () => {
    // Slow probes: the slot must not be un-selectable while they run.
    stubApi({ matchingDelayMs: 250 })
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    const slotButton = await screen.findByRole('button', { name: '2:00 PM' })
    expect(slotButton.disabled).toBe(false) // "checking" never blocks a click
    fireEvent.click(slotButton)
    await waitFor(() => expect(screen.getByRole('button', { name: '2:00 PM' }).getAttribute('aria-pressed')).toBe('true'))
  })

  it('survives rapid repeated clicks on one slot without losing the selection', async () => {
    stubApi()
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    const slotButton = await screen.findByRole('button', { name: '2:00 PM' })
    fireEvent.click(slotButton)
    fireEvent.click(slotButton)
    fireEvent.click(slotButton)
    expect(screen.getByRole('button', { name: '2:00 PM' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('booking-slot-picker')).toBeTruthy()
    await screen.findByRole('button', { name: /Mia Reco/ })
    expect(screen.getByText('Choose one stylist to continue.')).toBeTruthy()
  })
})

describe('BookingFlow — preferred stylist selection', () => {
  it('requires an explicit stylist pick: nothing auto-selects and review is blocked', async () => {
    stubApi()
    renderFlow()
    await fillSlot()
    // The matcher-validated stylist is offered but not chosen.
    const stylistButton = await screen.findByRole('button', { name: /Mia Reco/ })
    expect(stylistButton.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Choose one stylist to continue.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    expect(await screen.findByText('Please choose a stylist before continuing.')).toBeTruthy()
    expect(screen.queryByText(/appointment summary/i)).toBeNull()
  })

  it('posts the explicitly picked stylist and asks matching for the exact slot', async () => {
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
    await fillSlotAndPick()
    expect(screen.getByText('Covers all 1 category · staff rating 4.5 · 1 booking that day')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    expect(screen.getByText(/Stylist: Mia Reco/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0]).toEqual({
      staffId: 'm1',
      appointmentDate: openDay,
      startTime: '14:00',
      serviceIds: ['s1'],
    })
    // Matching is asked for this exact slot and service (the availability
    // probes use the same endpoint).
    expect(matchingUrls.length).toBeGreaterThan(0)
    const params = new URL(matchingUrls[0]).searchParams
    expect(params.get('serviceIds')).toBe('s1')
    expect(params.get('date')).toBe(openDay)
  })

  it('offers no Change stylist or No preference controls', async () => {
    stubApi()
    renderFlow()
    await fillSlot()
    await screen.findByRole('button', { name: /Mia Reco/ })
    expect(screen.queryByRole('button', { name: /change stylist/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /no preference/i })).toBeNull()
  })

  it('lists only full-coverage staff: partial matches are not offered at all', async () => {
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [staffEntry('a1', 'Ana', 'Partial', { coversAll: false, coversCategories: 0 })],
        reason: 'Covers all 1 category',
        partial: true,
        covers: 1,
        needed: 1,
      },
    })
    renderFlow()
    await fillSlotAndPick()
    // The full-coverage stylist is listed and picked; the partial one is
    // never offered at all.
    expect(screen.queryByRole('button', { name: /Ana Partial/ })).toBeNull()
  })

  it('grays every slot when nobody can staff the date, and nothing can be booked', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: null,
        alternatives: [staffEntry('a1', 'Ana', 'Partial', { coversAll: false, coversCategories: 0 })],
        reason: 'Covers 0 of 1',
        partial: true,
        covers: 0,
        needed: 1,
      },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: openDay } })
    fireEvent.click(screen.getByRole('button', { name: /^time$/i }))
    const firstSlot = await screen.findByRole('button', { name: '9:00 AM' })
    await waitFor(() => expect(firstSlot.disabled).toBe(true))
    expect(screen.getByText('Grayed times have no stylist available.')).toBeTruthy()
    // With no selectable slot the booking cannot even reach review.
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    expect(await screen.findByText(/Please complete the required fields before continuing/i)).toBeTruthy()
    expect(posts.length).toBe(0)
  })

  it('lets the customer pick a listed alternative explicitly', async () => {
    const posts = []
    stubApi({
      matching: {
        recommended: staffEntry('m1', 'Mia', 'Reco'),
        alternatives: [staffEntry('a2', 'Ava', 'Full', { coversAll: true, coversCategories: 2 })],
        reason: 'Covers all 2 categories · staff rating 4.8',
        partial: false,
        covers: 2,
        needed: 2,
      },
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    await fillSlotAndPick(openDay, '14:00', /Ava Full/)
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    expect(screen.getByText(/Stylist: Ava Full/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].staffId).toBe('a2')
  })

  it('clears a stale pick when the available staff change', async () => {
    stubApi({
      matching: (startTime) =>
        startTime === '15:00'
          ? { recommended: staffEntry('m2', 'Bea', 'New'), alternatives: [], reason: '', partial: false, covers: 1, needed: 1 }
          : M1_MATCH,
    })
    renderFlow()
    await fillSlotAndPick(openDay, '14:00')
    // 3:00 PM is staffed by someone else: the 2:00 PM pick must be cleared.
    const lateSlot = await screen.findByRole('button', { name: '3:00 PM' })
    await waitFor(() => expect(lateSlot.disabled).toBe(false))
    fireEvent.click(lateSlot)
    await screen.findByRole('button', { name: /Bea New/ })
    await waitFor(() => expect(screen.getByText('Choose one stylist to continue.')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Mia Reco/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    expect(await screen.findByText('Please choose a stylist before continuing.')).toBeTruthy()
    expect(screen.queryByText(/appointment summary/i)).toBeNull()
  })

})

describe('BookingFlow — pre-submit re-check (A6)', () => {
  it('blocks the submit with the specific reason when the slot went bad', async () => {
    const posts = []
    stubApi({
      onPost: (body) => posts.push(body),
      // Third fetch (just before the POST) reports Monday closed.
      hoursResponses: [OPEN_HOURS, OPEN_HOURS, withDayClosed(1)],
    })
    renderFlow()
    await fillSlotAndPick(nextWeekday(1), '14:00')
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
    await fillSlotAndPick()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText('Please choose a stylist before booking.')).toBeTruthy())
  })

  it("shows the server's message verbatim", async () => {
    stubApi({
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
    await fillSlotAndPick()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getByText('The salon opens at 09:00 on Monday.')).toBeTruthy())
    expect(screen.queryByText('Please choose a valid date and time during opening hours.')).toBeNull()
  })
})

describe('BookingFlow — payment results (Maya)', () => {
  it('starts the Maya checkout and shows an awaiting-payment result with no false claims', async () => {
    const posts = []
    stubApi({
      onPost: (body) => posts.push(body),
    })
    renderFlow()
    await fillSlotAndPick()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    // Default plan is Maya pay-in-full.
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(screen.getAllByText(/awaiting payment/i).length).toBeGreaterThan(0))
    expect(posts.length).toBe(1)
    // The result must never claim a received or verified payment.
    expect(screen.getByText(/payment: awaiting payment/i)).toBeTruthy()
    expect(screen.queryByText(/paid in full/i)).toBeNull()
    expect(screen.getByRole('button', { name: /open payment window/i })).toBeTruthy()
  })

  it('offers the 40% Maya down-payment option with display-only amounts', async () => {
    stubApi()
    renderFlow()
    await fillSlotAndPick()
    fireEvent.click(screen.getByRole('button', { name: /review booking/i }))
    await waitFor(() => expect(screen.getByText(/appointment summary/i)).toBeTruthy())
    const down = screen.getByRole('button', { name: /MAYA: DOWN PAYMENT 40%/i })
    expect(down.getAttribute('aria-pressed')).toBe('false')
    expect(down.textContent).toContain('₱200.00') // display only: round(500 x 40 / 100)
    fireEvent.click(down)
    expect(down.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Amounts are display only; the server confirms them/i)).toBeTruthy()
  })
})
