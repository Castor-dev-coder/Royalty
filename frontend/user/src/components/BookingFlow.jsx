import { useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'
import { ApiError, createAppointment, fetchEligibleStaff, fetchMatching } from '../lib/api.js'

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
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
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
  }, [form.date, form.time, service.id])

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
    if (!form.date || !form.time) {
      setError('Please complete the required fields before continuing.')
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

  function confirmBooking() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    createAppointment({
      staffId: form.staffId,
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
        setError(
          err instanceof ApiError && err.kind === 'validation'
            ? 'Please choose a valid date and time during opening hours.'
            : err instanceof ApiError
              ? err.message
              : 'Your booking could not be completed. Please try again.',
        )
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
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Time<input required type="time" value={form.time} onChange={(e) => update('time', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
            </div>
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
