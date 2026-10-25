import { useCallback, useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'
import {
  ApiError,
  createAppointment,
  fetchBusinessHours,
  fetchEligibleStaff,
  fetchMatching,
} from '../lib/api.js'
import {
  hoursForDate,
  isBookableDate,
  manilaTodayIso,
  slotProblem,
  validSlots,
  weekdayName,
} from '../lib/hours.js'

/* The progress indicator maps 1:1 onto the booking flow's real states:
   1 = details form, 2 = review, 3 = confirmation screen. */
const STEPS = ['Details', 'Review', 'Confirmed']
const SWIPE_MS = 260

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function todayIso() {
  // The salon's clock (Asia/Manila), not the browser's: a slot is "past"
  // when the salon says it is.
  return manilaTodayIso()
}

// A2: show the server's own reason for a failed booking. A staffId detail
// means no stylist was sent — map it to a stylist prompt; anything else keeps
// the server's message verbatim; generic only when there is no message.
function bookingErrorMessage(err) {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? err.details : []
    if (details.some((detail) => detail && detail.path === 'staffId')) {
      return 'Please choose a stylist before booking.'
    }
    if (err.message) return err.message
  }
  return 'Your booking could not be completed. Please try again.'
}

// Human summary for a non-recommended stylist: coverage first ("covers X of
// Y" whenever they don't cover every category), then rating/bookings.
function alternativeLabel(entry, needed) {
  const parts = []
  if (entry.coversAll) {
    if (needed > 0) parts.push(`covers all ${needed} ${needed === 1 ? 'category' : 'categories'}`)
  } else {
    parts.push(`covers ${entry.coversCategories} of ${needed}`)
  }
  if (entry.avgStaffRating != null) parts.push(`staff rating ${entry.avgStaffRating}`)
  if (entry.bookingsToday != null) {
    parts.push(`${entry.bookingsToday} ${entry.bookingsToday === 1 ? 'booking' : 'bookings'} that day`)
  }
  return parts.join(' · ')
}

function BookingFlow({ service, user, onClose }) {
  const [step, setStep] = useState(1)
  const [slide, setSlide] = useState(null) // { from, to, dir } while swiping
  const [form, setForm] = useState({ staffId: '', date: '', time: '' })
  const [staff, setStaff] = useState([])
  const [staffStatus, setStaffStatus] = useState('loading') // loading | ready | missing
  const [match, setMatch] = useState(null) // last GET /matching result
  const [matchStatus, setMatchStatus] = useState('idle') // idle | loading | ready | error
  // How the stylist was chosen: 'recommended' (auto), 'manual' (explicit pick)
  // or 'none' (No preference — resolved at submit).
  const [pickMode, setPickMode] = useState('recommended')
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null) // { appointmentCode }
  // Shop hours drive the slot picker (GET /schedules/business-hours).
  const [hours, setHours] = useState(null) // business-hours rows, or null unknown
  const [hoursStatus, setHoursStatus] = useState('idle') // idle | loading | ready | error
  const [pickerOpen, setPickerOpen] = useState(false)
  // Bumped to force a fresh matching call without moving the date/time.
  const [matchNonce, setMatchNonce] = useState(0)
  const transitioningRef = useRef(false)
  const slideTimerRef = useRef(null)
  const contentRef = useRef(null)
  // The matching effect must not re-run when the pick mode changes, so it
  // reads the current mode through a ref instead of state.
  const pickModeRef = useRef('recommended')

  function applyPickMode(mode) {
    pickModeRef.current = mode
    setPickMode(mode)
  }

  // The step shown in the header/progress during a swipe is the target step,
  // so the indicator moves in sync with the content the customer is moving to.
  const activeStep = slide ? slide.to : step

  // Keep focus inside the dialog whenever the visible step changes.
  useEffect(() => {
    contentRef.current?.focus()
  }, [step])

  // Nothing persistent is left behind if the dialog unmounts mid-transition.
  useEffect(() => () => {
    transitioningRef.current = false
    if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current)
    slideTimerRef.current = null
  }, [])

  // Opening hours: fetched when the flow opens and re-fetched whenever the
  // picker opens (A6) and again just before submit. A failed fetch leaves the
  // last known hours in place — the server is the final authority anyway.
  const loadHours = useCallback(() => {
    return fetchBusinessHours().then(
      (data) => {
        const rows = data?.businessHours ?? []
        setHours(rows)
        setHoursStatus('ready')
        return rows
      },
      () => {
        setHoursStatus((current) => (current === 'ready' ? 'ready' : 'error'))
        return null
      },
    )
  }, [])

  useEffect(() => {
    void loadHours()
  }, [loadHours])

  // Eligible staff for this service — the manual choices when no matching has
  // run yet (POST /appointments requires staffId).
  useEffect(() => {
    let stale = false
    fetchEligibleStaff([service.id]).then(
      (data) => {
        if (stale) return
        const rows = data?.staff ?? []
        setStaff(rows)
        setStaffStatus(rows.length > 0 ? 'ready' : 'missing')
      },
      () => {
        if (!stale) setStaffStatus('missing')
      },
    )
    return () => {
      stale = true
    }
  }, [service.id])

  // Best stylist for the picked slot. Runs once date AND time are set (and
  // re-runs when either changes). The recommendation is auto-selected; when
  // nobody covers every category (recommended is null) nothing is selected.
  useEffect(() => {
    if (!form.date || !form.time) return undefined
    let stale = false
    fetchMatching({ serviceIds: [service.id], date: form.date, startTime: form.time }).then(
      (data) => {
        if (stale) return
        const result = {
          recommended: data?.recommended ?? null,
          alternatives: data?.alternatives ?? [],
          reason: data?.reason ?? '',
          covers: data?.covers ?? 0,
          needed: data?.needed ?? 0,
        }
        setMatch(result)
        setMatchStatus('ready')
        setShowAlternatives(false)
        // A manual pick or 'No preference' survives a re-match; only the
        // automatic choice follows the recommendation.
        if (pickModeRef.current === 'recommended') {
          setForm((current) => ({
            ...current,
            staffId: result.recommended ? result.recommended.id : '',
          }))
        }
      },
      () => {
        if (!stale) setMatchStatus('error')
      },
    )
    return () => {
      stale = true
    }
  }, [form.date, form.time, service.id, matchNonce])

  // Total minutes the booking will occupy — the slot must fit inside hours.
  const durationMinutes = Number(service.durationMinutes) || 0

  // Starts the customer may book for the selected date (A3): inside hours,
  // whole appointment before closing, and in the future per Asia/Manila.
  const dateValid = isBookableDate(form.date)
  const slots = hours && dateValid ? validSlots({ rows: hours, date: form.date, durationMinutes }) : []
  const dayRow = hours && dateValid ? hoursForDate(hours, form.date) : null
  const closedDay = Boolean(hours && dateValid && (!dayRow || !dayRow.isOpen))

  // A selected time that stopped being bookable (date change, refreshed
  // hours) is dropped instead of silently submitted — the same reset a date
  // change performs.
  useEffect(() => {
    if (!form.time || !hours || !form.date) return
    if (!validSlots({ rows: hours, date: form.date, durationMinutes }).includes(form.time)) {
      setForm((current) => ({ ...current, time: '', ...(pickModeRef.current === 'recommended' ? { staffId: '' } : {}) }))
      setMatch(null)
      setMatchStatus('idle')
      setShowAlternatives(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, form.date, durationMinutes])

  // Known staff entries from both sources, deduplicated — the dropdown may
  // show anyone the customer could pick.
  const selectEntries = []
  const seenIds = new Set()
  for (const entry of [match?.recommended, ...(match?.alternatives ?? []), ...staff]) {
    if (entry && !seenIds.has(entry.id)) {
      seenIds.add(entry.id)
      selectEntries.push(entry)
    }
  }

  function staffEntryFor(id) {
    if (!id) return null
    return selectEntries.find((entry) => entry.id === id) ?? null
  }

  // 'No preference' sends the recommendation if any, else the first
  // alternative; with nobody at all the booking is blocked below.
  function resolveStaffId() {
    if (pickMode === 'none') {
      return match?.recommended?.id ?? match?.alternatives?.[0]?.id ?? null
    }
    return form.staffId || null
  }

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    // Slot changes drive matching (event driven — effects must not set state
    // synchronously): an incomplete slot drops the match, a complete one asks
    // for a fresh recommendation.
    if (name === 'date' || name === 'time') {
      const nextDate = name === 'date' ? value : form.date
      const nextTime = name === 'time' ? value : form.time
      if (!nextDate || !nextTime) {
        setMatch(null)
        setMatchStatus('idle')
        setShowAlternatives(false)
        if (pickModeRef.current === 'recommended') {
          setForm((current) => ({ ...current, staffId: '' }))
        }
      } else {
        setMatchStatus('loading')
        setShowAlternatives(false)
      }
    }
  }

  function onStaffChange(value) {
    applyPickMode(value ? 'manual' : 'recommended')
    setShowAlternatives(false)
    update('staffId', value)
  }

  function chooseAlternative(entry) {
    applyPickMode('manual')
    setShowAlternatives(false)
    update('staffId', entry.id)
  }

  function chooseNoPreference() {
    applyPickMode('none')
    setShowAlternatives(false)
    update('staffId', '')
  }

  // A6: every open of the picker re-fetches the shop hours and re-asks
  // matching for the current slot, so the list reflects live availability.
  function togglePicker() {
    setPickerOpen((open) => !open)
    void loadHours()
    if (form.date && form.time) setMatchNonce((nonce) => nonce + 1)
  }

  // A stale rendered slot can never be selected: the click re-validates it
  // against the freshest known hours before it reaches the form.
  function chooseSlot(slot) {
    if (!slots.includes(slot)) return
    setPickerOpen(false)
    update('time', slot)
  }

  // Horizontal swipe between steps: the outgoing step slides out toward the
  // direction of travel while the new step slides in from the opposite side.
  // The guard makes rapid clicks a no-op instead of overlapping transitions.
  function goToStep(next) {
    if (transitioningRef.current || next === step) return

    if (prefersReducedMotion()) {
      setStep(next)
      return
    }

    const dir = next > step ? 1 : -1
    const commit = () => {
      if (!transitioningRef.current) return
      transitioningRef.current = false
      if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current)
      slideTimerRef.current = null
      setStep(next)
      setSlide(null)
      contentRef.current?.focus()
    }

    transitioningRef.current = true
    setSlide({ from: step, to: next, dir })
    contentRef.current?.focus()
    // Safety net: if the animation events never fire, the step still commits
    // and the modal can never be left blank or stuck.
    slideTimerRef.current = window.setTimeout(commit, SWIPE_MS + 160)
  }

  function continueToReview(event) {
    event.preventDefault()
    if (!dateValid || !form.time) {
      setError('Please complete the required fields before continuing.')
      return
    }
    // Blocked with the specific reason (closed day, too early, too late, past).
    const problem = slotProblem({ rows: hours, date: form.date, time: form.time, durationMinutes })
    if (problem) {
      setError(problem)
      return
    }
    const staffId = resolveStaffId()
    if (!staffId) {
      if (pickMode === 'none') {
        setError('No stylist is available for this slot')
      } else {
        const anyoneAvailable =
          Boolean(match?.recommended) || (match?.alternatives?.length ?? 0) > 0 || staff.length > 0
        setError(
          anyoneAvailable
            ? 'Please choose a stylist before continuing.'
            : 'No stylist is available for this slot',
        )
      }
      return
    }
    setForm((current) => ({ ...current, staffId }))
    goToStep(2)
  }

  async function confirmBooking() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    // A6: shop hours and matching are re-fetched just before the POST; a slot
    // that became invalid blocks the submit with the specific reason.
    const [freshHours, freshMatch] = await Promise.all([
      loadHours(),
      form.date && form.time
        ? fetchMatching({ serviceIds: [service.id], date: form.date, startTime: form.time }).then(
            (data) => ({
              recommended: data?.recommended ?? null,
              alternatives: data?.alternatives ?? [],
              reason: data?.reason ?? '',
              covers: data?.covers ?? 0,
              needed: data?.needed ?? 0,
            }),
            () => null,
          )
        : Promise.resolve(null),
    ])
    const problem = slotProblem({
      rows: freshHours ?? hours,
      date: form.date,
      time: form.time,
      durationMinutes,
    })
    if (problem) {
      setSubmitting(false)
      setError(problem)
      return
    }
    const matchNow = freshMatch ?? match
    if (freshMatch) setMatch(freshMatch)
    // Never POST a missing staffId. 'No preference' resolves against the
    // freshest recommendation/alternative; with nobody left the submit is
    // blocked and the matching reason is shown.
    const staffId =
      pickModeRef.current === 'none'
        ? matchNow?.recommended?.id ?? matchNow?.alternatives?.[0]?.id ?? null
        : form.staffId || null
    if (!staffId) {
      setSubmitting(false)
      setError(matchNow?.reason || 'Please choose a stylist before booking.')
      return
    }
    setForm((current) => ({ ...current, staffId }))
    createAppointment({
      staffId,
      appointmentDate: form.date,
      startTime: form.time,
      serviceIds: [service.id],
    }).then(
      (data) => {
        setSubmitting(false)
        setConfirmation(data?.appointment ?? data ?? {})
        goToStep(3)
      },
      (err) => {
        setSubmitting(false)
        setError(bookingErrorMessage(err))
      },
    )
  }

  function renderStep(number) {
    if (number === 3) {
      return (
        <div className="px-6 py-12 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-(--gold) text-3xl text-(--gold)">✓</div>
          <h3 className="mt-5 font-(--serif) text-2xl text-(--gold)">Thank you, {user?.name || 'guest'}!</h3>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">Your appointment has been successfully booked. We look forward to pampering you!</p>
          {confirmation?.appointmentCode && (
            <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
              Reference: {confirmation.appointmentCode}
            </p>
          )}
          <button type="button" onClick={onClose} className="btn-pill mt-7 border border-(--gold) bg-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Done</button>
        </div>
      )
    }

    const chosenStaff = staffEntryFor(form.staffId)

    return (
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center gap-3 rounded border border-[rgba(212,180,92,.35)] bg-[#181612] p-3"><SafeImage className="size-14 rounded object-cover" src={undefined} alt="" /><div><p className="m-0 font-(--serif) text-lg text-[#f3eee5]">{service.name}</p><p className="m-0 mt-1 text-xs text-(--gold)\">{service.durationMinutes} MIN · {formatPeso(service.price)}</p></div></div>
        {staffStatus === 'missing' ? (
          <div className="grid gap-4 text-center">
            <p className="m-0 text-sm leading-6 text-[#bbb6ad]" role="alert">
              Online booking is not available for this service yet — no eligible staff can be assigned.
            </p>
            <button type="button" onClick={onClose} className="btn-pill border border-(--gold) bg-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Close</button>
          </div>
        ) : number === 1 ? (
          <form className="grid gap-4" onSubmit={continueToReview}>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Date<input required type="date" min={todayIso()} value={form.date} onChange={(e) => update('date', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wider text-[#bcb5a9]" id="booking-time-label">Time</span>
                <button
                  aria-controls="booking-slot-picker"
                  aria-expanded={pickerOpen}
                  aria-labelledby="booking-time-label"
                  className="cursor-pointer rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-left text-sm text-white outline-none focus:border-(--gold)"
                  onClick={togglePicker}
                  type="button"
                >
                  {form.time || 'Select a time'}
                </button>
              </div>
            </div>
            {pickerOpen && (
              <div className="rounded border border-[#3a3835] bg-[#1c1b18] p-3" id="booking-slot-picker">
                {!dateValid ? (
                  <p className="m-0 text-xs leading-5 text-[#bcb5a9]">Pick a date to see available times.</p>
                ) : !hours && hoursStatus !== 'error' ? (
                  <p className="m-0 text-xs leading-5 text-[#bcb5a9]" role="status">Loading opening hours…</p>
                ) : hoursStatus === 'error' && !hours ? (
                  <div className="grid gap-2">
                    <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">
                      Opening hours are unavailable right now — please try again.
                    </p>
                    <button type="button" onClick={() => void loadHours()} className="btn-pill w-fit cursor-pointer rounded-full border border-[#635b4c] px-4 py-2 text-xs font-bold uppercase text-[#d5cdbf]">Retry</button>
                  </div>
                ) : closedDay ? (
                  <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="status">{`Closed on ${weekdayName(form.date)}`}</p>
                ) : slots.length === 0 ? (
                  <p className="m-0 text-xs leading-5 text-[#bcb5a9]">{`No available times on ${weekdayName(form.date)} — try another date.`}</p>
                ) : (
                  <div aria-label="Available start times" className="grid grid-cols-4 gap-2 max-[420px]:grid-cols-3" role="group">
                    {slots.map((slot) => (
                      <button
                        aria-pressed={form.time === slot}
                        className={`btn-pill cursor-pointer rounded border px-2 py-2 text-center text-xs tabular-nums ${form.time === slot ? 'border-(--gold) bg-(--gold) text-[#111]' : 'border-[#3a3835] text-white hover:border-(--gold)'}`}
                        key={slot}
                        onClick={() => chooseSlot(slot)}
                        type="button"
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Preferred stylist
                <select value={form.staffId} onChange={(e) => onStaffChange(e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-(--gold)">
                  {staffStatus === 'loading' && matchStatus !== 'ready' && <option value="">Loading stylists…</option>}
                  {!(staffStatus === 'loading' && matchStatus !== 'ready') && (
                    <option value="">{pickMode === 'none' ? 'No preference — best available stylist' : 'Select a stylist'}</option>
                  )}
                  {selectEntries.map((member) => (
                    <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.primaryRole}</option>
                  ))}
                </select>
              </label>
              {matchStatus === 'loading' && (
                <p className="m-0 text-xs text-[#bcb5a9]" role="status">Finding the best stylist for this slot…</p>
              )}
              {matchStatus === 'ready' && match.reason && (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">{match.reason}</p>
              )}
              {matchStatus === 'error' && (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">
                  Automatic stylist suggestions are unavailable right now — please choose a stylist.
                </p>
              )}
              {matchStatus === 'ready' && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-expanded={showAlternatives} onClick={() => setShowAlternatives((open) => !open)} className="btn-pill cursor-pointer rounded-full border border-[#635b4c] px-4 py-2 text-xs font-bold uppercase text-[#d5cdbf]">Change stylist</button>
                  <button type="button" aria-pressed={pickMode === 'none'} onClick={chooseNoPreference} className={`btn-pill cursor-pointer rounded-full border px-4 py-2 text-xs font-bold uppercase ${pickMode === 'none' ? 'border-(--gold) bg-(--gold) text-[#111]' : 'border-[#635b4c] text-[#d5cdbf]'}`}>No preference</button>
                </div>
              )}
              {showAlternatives && (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {(match?.alternatives ?? []).length === 0 && (
                    <li className="text-xs leading-5 text-[#bcb5a9]">No other stylist is available for this slot.</li>
                  )}
                  {(match?.alternatives ?? []).map((entry) => (
                    <li key={entry.id}>
                      <button type="button" aria-pressed={form.staffId === entry.id} onClick={() => chooseAlternative(entry)} className="w-full cursor-pointer rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-left text-sm text-white outline-none hover:border-(--gold) focus:border-(--gold)">
                        <span className="block">{entry.firstName} {entry.lastName} · {entry.primaryRole}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#bcb5a9]">{alternativeLabel(entry, match?.needed ?? 0)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pickMode === 'none' && (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">
                  No preference — we&apos;ll assign the best available stylist for this slot.
                </p>
              )}
            </div>
            {error && <p className="m-0 text-xs text-[#e9a68c]" role="alert">{error}</p>}
            <button className="btn-pill mt-2 border border-(--gold) bg-(--gold) px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Review booking</button>
          </form>
        ) : (
          <div className="grid gap-5">
            <div className="rounded border border-[rgba(212,180,92,.25)] p-4 text-sm leading-7 text-[#cbc5ba]">
              <p className="m-0 text-xs uppercase tracking-wider text-(--gold)\">Appointment summary</p>
              <p className="m-0 mt-2">{form.date} at {form.time}</p>
              <p className="m-0">Stylist: {chosenStaff ? `${chosenStaff.firstName} ${chosenStaff.lastName}` : 'Assigned automatically'}</p>
              <p className="m-0">Total: <strong className="text-(--gold)\">{formatPeso(service.price)}</strong></p>
              <p className="m-0 mt-1 text-[10px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">Payment happens at the salon</p>
            </div>
            {error && <p className="m-0 text-xs text-[#e9a68c]" role="alert">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => goToStep(1)} className="btn-pill flex-1 border border-[#635b4c] px-5 py-3 text-xs font-bold uppercase text-[#d5cdbf]">Back</button>
              <button type="button" onClick={confirmBooking} disabled={submitting} className="btn-pill flex-1 border border-(--gold) bg-(--gold) px-5 py-3 text-xs font-bold uppercase text-[#111] disabled:cursor-default disabled:opacity-60">{submitting ? 'Booking…' : 'Confirm booking'}</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog labelledBy="booking-title" onClose={onClose} panelClassName="max-h-[92vh] w-full max-w-140 overflow-y-auto rounded-md border border-(--gold) bg-[#11110f] shadow-[0_20px_80px_rgba(0,0,0,.65)]">
        <div className="flex items-center justify-between border-b border-[rgba(212,180,92,.25)] px-6 py-5">
          <div><p className="m-0 text-[10px] uppercase tracking-[2px] text-(--gold)\">Royalty Salon</p><h2 id="booking-title" className="m-1 font-(--serif) text-2xl text-[#f3eee5]">{activeStep === 3 ? 'Booking Confirmed' : activeStep === 2 ? 'Review your booking' : 'Book your appointment'}</h2></div>
          <button type="button" onClick={onClose} className="text-2xl text-[#aaa49a] hover:text-(--gold)" aria-label="Close">×</button>
        </div>

        <div className="border-b border-[rgba(212,180,92,.18)] px-6 pt-4 pb-3.5">
          <ol className="m-0 flex list-none items-center justify-between gap-2 p-0 text-[10px] uppercase tracking-[1.5px]">
            {STEPS.map((label, index) => {
              const number = index + 1
              const state = number < activeStep ? 'done' : number === activeStep ? 'current' : 'todo'
              return (
                <li key={label} aria-current={state === 'current' ? 'step' : undefined} className={`flex items-center gap-1.5 ${state === 'todo' ? 'text-[#8d877c]' : state === 'current' ? 'text-[#f3eee5]' : 'text-(--gold)'}`}>
                  <span aria-hidden="true" className={`grid size-[19px] place-items-center rounded-full border text-[9px] ${state === 'todo' ? 'border-[#4a463f]' : 'border-(--gold) text-(--gold)'}`}>{state === 'done' ? '✓' : number}</span>
                  <span className={`max-[480px]:sr-only ${state === 'current' ? 'font-semibold' : ''}`}>{label}</span>
                </li>
              )
            })}
          </ol>
          <div aria-hidden="true" className="booking-progress mt-2.5">
            <div className="booking-progress-fill" style={{ width: `${(activeStep / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <div ref={contentRef} tabIndex={-1} className="booking-step-viewport outline-none">
          {slide && (
            <div
              className={`booking-step ${slide.dir > 0 ? 'booking-step--out-left' : 'booking-step--out-right'}`}
              aria-hidden="true"
              inert={true}
            >
              {renderStep(slide.from)}
            </div>
          )}
          <div
            className={`booking-step ${slide ? (slide.dir > 0 ? 'booking-step--in-right' : 'booking-step--in-left') : ''}`}
            onAnimationEnd={slide ? () => {
              // Idempotent with the safety timer: the first call commits.
              if (!transitioningRef.current) return
              transitioningRef.current = false
              if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current)
              slideTimerRef.current = null
              setStep(slide.to)
              setSlide(null)
              contentRef.current?.focus()
            } : undefined}
          >
            {renderStep(slide ? slide.to : step)}
          </div>
        </div>
    </Dialog>
  )
}

export default BookingFlow
