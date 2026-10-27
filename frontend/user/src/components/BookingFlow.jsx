import { useCallback, useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import GCashPaymentDialog from './GCashPaymentDialog.jsx'
import SafeImage from './SafeImage.jsx'
import { categoryImage } from '../lib/categoryImage.js'
import {
  ApiError,
  createAppointment,
  fetchBusinessHours,
  fetchEligibleStaff,
  fetchMatching,
  fetchPaymentSettings,
} from '../lib/api.js'
import {
  hoursForDate,
  isBookableDate,
  manilaMonthEndIso,
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

/** 'October 2026' — the month the current-month-only policy is open for. */
function bookingMonthLabel() {
  return new Date(`${manilaTodayIso().slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
  // Set when the customer advances with a staff/slot selection that still
  // needs attention. Advancing is allowed; confirming is gated.
  const [selectionWarning, setSelectionWarning] = useState('')
  const [slide, setSlide] = useState(null) // { from, to, dir } while swiping
  const [form, setForm] = useState({ staffId: '', date: '', time: '' })
  const [staffStatus, setStaffStatus] = useState('loading') // loading | ready | missing
  const [match, setMatch] = useState(null) // last GET /matching result
  const [matchStatus, setMatchStatus] = useState('idle') // idle | loading | ready | error
  // How the stylist was chosen: 'recommended' (auto), 'manual' (explicit pick)
  // or 'none' (No preference — resolved at submit).
  const [pickMode, setPickMode] = useState('recommended')
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null) // created appointment ({ id, appointmentCode })
  // Payment choice inside the Review step: 'SALON' (default), 'FULL', 'DOWN'.
  const [paymentPlan, setPaymentPlan] = useState('SALON')
  // Public payment settings (configured = a QR is set) gate the GCash options.
  const [paySettings, setPaySettings] = useState(null)
  // The deposit percent is a server setting the UI reads, never a local guess.
  const depositPercent = paySettings?.downPaymentKind === 'PERCENT' ? paySettings.downPaymentValue : null
  // Opened on the Confirmed step when a GCash plan was chosen.
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  // True only after the backend stored the payment proof. The result screen
  // must never claim a received or verified payment before that.
  const [proofSubmitted, setProofSubmitted] = useState(false)
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

  // Payment settings decide whether the GCash options are available at all.
  useEffect(() => {
    let cancelled = false
    fetchPaymentSettings().then(
      (data) => {
        if (!cancelled) setPaySettings(data?.settings ?? null)
      },
      () => {
        if (!cancelled) setPaySettings(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

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
    // Always fresh: booking availability must reflect the live schedule (the
    // pre-submit re-check re-reads it on purpose). The shared catalogue cache
    // serves display-only consumers instead.
    return fetchBusinessHours({ fresh: true }).then(
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

  // Eligible staff for this service gate whether online booking exists at
  // all (POST /appointments needs an assignable stylist). The raw rows are
  // kept out of the picker on purpose: only matcher-validated entries are
  // selectable, so this fetch just drives the availability gate below.
  useEffect(() => {
    let stale = false
    fetchEligibleStaff([service.id]).then(
      (data) => {
        if (stale) return
        setStaffStatus((data?.staff ?? []).length > 0 ? 'ready' : 'missing')
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
        // The only picks this match validates: the recommendation and its
        // alternatives. Anything else was chosen against a different slot.
        const eligibleIds = new Set(
          [result.recommended?.id, ...result.alternatives.map((entry) => entry.id)].filter(Boolean),
        )
        // A clean resolution (a matched stylist covering every service) clears
        // a stale review-step warning; partial or unmatched picks keep theirs.
        const resolvedId =
          pickModeRef.current === 'none'
            ? (result.recommended?.id ??
              result.alternatives.find((entry) => entry.coversAll !== false)?.id ??
              null)
            : form.staffId || null
        const resolvedEntry = [result.recommended, ...result.alternatives].find(
          (entry) => entry?.id === resolvedId,
        )
        if (resolvedId && resolvedEntry && resolvedEntry.coversAll !== false) {
          setSelectionWarning('')
        }
        // A manual pick or 'No preference' survives a re-match; only the
        // automatic choice follows the recommendation.
        if (pickModeRef.current === 'recommended') {
          setForm((current) => ({
            ...current,
            staffId: result.recommended ? result.recommended.id : '',
          }))
        } else if (form.staffId && !eligibleIds.has(form.staffId)) {
          // The chosen stylist is not validated for this slot: reset the
          // selection instead of silently keeping an unverified pick, and
          // drop the warning that was about the old pick.
          setSelectionWarning('')
          setForm((current) => ({ ...current, staffId: '' }))
        }
      },
      () => {
        if (stale) return
        // Eligibility cannot be verified right now: drop the match and any
        // pick that relied on it rather than keeping an unverified name.
        setMatch(null)
        setMatchStatus('error')
        setSelectionWarning('')
        setForm((current) => ({ ...current, staffId: '' }))
      },
    )
    return () => {
      stale = true
    }
    // Matching is keyed on date/time only; form.staffId is read through the
    // closure for the stale-warning clear and must not re-run the fetch per
    // staff pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // The slot (and with it the match) is gone, so any pick is unverified:
      // reset it instead of silently keeping it.
      setForm((current) => ({ ...current, time: '', staffId: '' }))
      setMatch(null)
      setMatchStatus('idle')
      setShowAlternatives(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, form.date, durationMinutes])

  // Known staff entries from the matcher only, deduplicated. The select
  // offers just what the matcher validated for the chosen slot (active,
  // scheduled, available, category-checked): the recommendation and its
  // alternatives. The raw eligible-staff list is never selectable here
  // because its eligibility cannot be verified for this slot.
  const selectEntries = []
  const seenIds = new Set()
  for (const entry of [match?.recommended, ...(match?.alternatives ?? [])]) {
    if (entry && !seenIds.has(entry.id)) {
      seenIds.add(entry.id)
      selectEntries.push(entry)
    }
  }

  // A pick the customer can actually make for this slot: the recommendation
  // or an alternative that covers every selected service.
  const hasEligibleStaff = Boolean(
    matchStatus === 'ready' &&
      (match?.recommended || (match?.alternatives ?? []).some((entry) => entry.coversAll !== false)),
  )

  function staffEntryFor(id) {
    if (!id) return null
    return selectEntries.find((entry) => entry.id === id) ?? null
  }

  // 'No preference' sends the recommendation if any, else the first
  // alternative; with nobody at all the booking is blocked below.
  function resolveStaffId() {
    if (pickMode === 'none') {
      // Prefer a stylist who covers every category; a partial fallback is
      // kept visible through the warning rather than silently booked.
      return (
        match?.recommended?.id ??
        match?.alternatives?.find((entry) => entry.coversAll !== false)?.id ??
        match?.alternatives?.[0]?.id ??
        null
      )
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
        // No slot, no match, no validation: any pick is stale and is reset.
        setForm((current) => ({ ...current, staffId: '' }))
      } else {
        setMatchStatus('loading')
        setShowAlternatives(false)
      }
    }
  }

  // The empty option means 'No preference — best available stylist', so it
  // picks the same mode as the No preference button. A pick that covers
  // every service corrects the selection, so its stale warning goes too.
  function onStaffChange(value) {
    applyPickMode(value ? 'manual' : 'none')
    setShowAlternatives(false)
    const entry = value ? selectEntries.find((candidate) => candidate.id === value) : null
    if (!value || (entry && entry.coversAll !== false)) setSelectionWarning('')
    update('staffId', value)
  }

  function chooseAlternative(entry) {
    applyPickMode('manual')
    setShowAlternatives(false)
    if (entry.coversAll !== false) setSelectionWarning('')
    update('staffId', entry.id)
  }

  function chooseNoPreference() {
    applyPickMode('none')
    setShowAlternatives(false)
    setSelectionWarning('')
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
    // A pick outside the validated match set, or one that does not cover every
    // service category, may be refused at booking. The customer can still
    // review the booking; the concern is spelled out and confirming is gated.
    const validatedIds = new Set(
      [match?.recommended?.id, ...(match?.alternatives ?? []).map((entry) => entry.id)].filter(Boolean),
    )
    const needed = match?.needed ?? 0
    const chosen = staffEntryFor(staffId)
    const partialPick =
      needed > 0 && chosen?.coversAll === false && match?.recommended?.id !== staffId
    if (!staffId) {
      setSelectionWarning(
        pickMode === 'none'
          ? 'No stylist is available for this slot yet. Choose a stylist or another time before confirming.'
          : 'Please choose a stylist before confirming this booking.',
      )
    } else if ((validatedIds.size > 0 && !validatedIds.has(staffId)) || partialPick) {
      setSelectionWarning(
        'This stylist may not be scheduled at that time, or does not cover every service in this booking. You can still review the booking; confirm with a suitable stylist or time.',
      )
      setForm((current) => ({ ...current, staffId }))
    } else {
      setSelectionWarning('')
      setForm((current) => ({ ...current, staffId }))
    }
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
        ? matchNow?.recommended?.id ??
          matchNow?.alternatives?.find((entry) => entry.coversAll !== false)?.id ??
          matchNow?.alternatives?.[0]?.id ??
          null
        : form.staffId || null
    if (!staffId) {
      setSubmitting(false)
      setError(matchNow?.reason || 'Please choose a stylist before booking.')
      return
    }
    // Full category coverage is required to book: a partial match is refused
    // here with a friendly explanation instead of a raw server rejection.
    const neededNow = matchNow?.needed ?? 0
    const chosenNow = [matchNow?.recommended, ...(matchNow?.alternatives ?? [])].find(
      (entry) => entry?.id === staffId,
    ) ?? null
    if (neededNow > 0 && chosenNow?.coversAll === false && matchNow?.recommended?.id !== staffId) {
      setSubmitting(false)
      setError("This stylist doesn't cover every service category for this booking. Please choose another stylist or another time.")
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
        // A GCash plan opens the existing payment dialog preselected; closing
        // it leaves the booking in place and the card keeps its pay button.
        if (paymentPlan !== 'SALON') setPayDialogOpen(true)
      },
      (err) => {
        setSubmitting(false)
        setError(bookingErrorMessage(err))
      },
    )
  }

  function renderStep(number) {
    if (number === 3) {
      const payAtSalon = paymentPlan === 'SALON'
      return (
        <div className="px-6 py-12 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-(--gold) text-3xl text-(--gold)">✓</div>
          <h3 className="mt-5 font-(--serif) text-2xl text-(--gold)">{payAtSalon ? `Thank you, ${user?.name || 'guest'}!` : 'Appointment created'}</h3>
          {payAtSalon ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Appointment booked. Payment is due at the salon: you can pay the outstanding balance with cash or GCash when you arrive.
            </p>
          ) : proofSubmitted ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Payment proof submitted. Your receipt is awaiting verification by the salon.
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Your appointment is reserved pending payment. Submit your GCash payment and receipt to complete the payment step.
            </p>
          )}
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
            {payAtSalon ? 'Payment: due at the salon' : proofSubmitted ? 'Payment proof submitted — awaiting verification' : 'Payment: awaiting proof submission'}
          </p>
          {confirmation?.appointmentCode && (
            <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
              Reference: {confirmation.appointmentCode}
            </p>
          )}
          {!payAtSalon && !proofSubmitted && (
            <button type="button" onClick={() => setPayDialogOpen(true)} className="btn-pill mt-5 border border-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-(--gold)">
              Open payment window
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-pill mt-7 border border-(--gold) bg-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Done</button>
        </div>
      )
    }

    const chosenStaff = staffEntryFor(form.staffId)

    return (
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center gap-3 rounded border border-[rgba(212,180,92,.35)] bg-[#181612] p-3"><SafeImage className="size-14 rounded object-cover" src={categoryImage(service.categoryName)} alt="" /><div><p className="m-0 font-(--serif) text-lg text-[#f3eee5]">{service.name}</p><p className="m-0 mt-1 text-xs text-(--gold)\">{service.durationMinutes} MIN · {formatPeso(service.price)}</p></div></div>
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
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Date<input required type="date" min={todayIso()} max={manilaMonthEndIso()} value={form.date} onChange={(e) => update('date', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
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
            <p className="m-0 text-xs leading-5 text-[#bcb5a9]">
              {`Bookings are open for ${bookingMonthLabel()} only.`}
            </p>
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
                    <option key={member.id} value={member.id} disabled={member.coversAll === false}>
                      {member.firstName} {member.lastName} · {member.primaryRole}
                      {member.coversAll === false ? ' (does not cover all selected services)' : ''}
                    </option>
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
                <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">
                  We cannot verify stylist availability right now. Try again shortly.
                </p>
              )}
              {matchStatus === 'ready' && !hasEligibleStaff && (
                <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">
                  No staff are available for this date and time. Choose another time or date.
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
                      <button
                        type="button"
                        aria-pressed={form.staffId === entry.id}
                        aria-disabled={entry.coversAll === false}
                        disabled={entry.coversAll === false}
                        onClick={() => chooseAlternative(entry)}
                        className={`w-full rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-left text-sm text-white outline-none ${entry.coversAll === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-(--gold) focus:border-(--gold)'}`}
                      >
                        <span className="block">{entry.firstName} {entry.lastName} · {entry.primaryRole}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#bcb5a9]">{alternativeLabel(entry, match?.needed ?? 0)}</span>
                        {entry.coversAll === false && (
                          <span className="mt-1 block text-xs leading-5 text-[#e9a68c]">Does not cover all selected services.</span>
                        )}
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
            </div>
            {selectionWarning && (
              <p className="m-0 rounded border border-[rgba(233,166,140,.4)] p-3 text-xs leading-5 text-[#e9a68c]" role="alert">{selectionWarning}</p>
            )}
            <fieldset className="m-0 grid gap-2 rounded border border-[rgba(212,180,92,.25)] p-4">
              <legend className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">Payment</legend>
              {[
                ['SALON', 'Pay at the salon', null],
                ['FULL', 'GCash: pay in full', service.price],
                [
                  'DOWN',
                  depositPercent != null
                    ? `GCash: ${depositPercent}% down payment`
                    : 'GCash: down payment',
                  // Display only (integer centavos); the server confirms the amount.
                  depositPercent != null ? Math.round(service.price * 100 * depositPercent / 100) / 100 : null,
                ],
              ].map(([key, label, amount]) => {
                const gcash = key !== 'SALON'
                const disabled = gcash && paySettings?.configured !== true
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={paymentPlan === key}
                    disabled={disabled}
                    onClick={() => setPaymentPlan(key)}
                    className={`min-h-[44px] w-full cursor-pointer rounded-full border px-5 text-left text-[12px] font-semibold tracking-[0.12em] uppercase ${paymentPlan === key ? 'border-(--gold) bg-(--gold) text-[#111]' : 'border-[#3a352c] text-[#d8d4cb] hover:border-(--gold)'} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {label}
                    {amount != null && ` — ${formatPeso(amount)}`}
                  </button>
                )
              })}
              <p className="m-0 mt-1 text-[10px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
                {paySettings?.configured === true
                  ? 'Amounts are display only; the server confirms them.'
                  : "GCash isn't available yet"}
              </p>
            </fieldset>
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
    <>
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
      {payDialogOpen && confirmation && (
        <GCashPaymentDialog
          item={confirmation}
          preselectedOption={paymentPlan === 'DOWN' ? 'DOWN' : 'FULL'}
          onClose={() => setPayDialogOpen(false)}
          onSubmitted={() => { setProofSubmitted(true); setPayDialogOpen(false) }}
        />
      )}
    </>
  )
}

export default BookingFlow
