import { useCallback, useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'
import { categoryImage } from '../lib/categoryImage.js'
import {
  ApiError,
  createAppointment,
  createMayaCheckout,
  fetchBusinessHours,
  fetchEligibleStaff,
  fetchMatching,
  fetchPaymentSettings,
} from '../lib/api.js'
import { holdCountdownText, makeAttemptToken } from '../lib/payments.js'
import {
  bookingWindowEndIso,
  formatTime12,
  hoursForDate,
  isBookableDate,
  manilaTodayIso,
  slotProblem,
  validSlots,
  weekdayName,
} from '../lib/hours.js'

/* The progress indicator maps 1:1 onto the booking flow's real states:
   1 = details form, 2 = review, 3 = confirmation screen. */
const STEPS = ['Details', 'Review', 'Payment']
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

/** 'December 2026' — the last month of the three-month booking window. */
function bookingWindowLabel() {
  return new Date(`${bookingWindowEndIso()}T12:00:00Z`).toLocaleDateString('en-US', {
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
  // Per-slot stylist availability for the selected date: 'checking' while the
  // probe runs, 'bookable' when at least one eligible stylist exists, 'empty'
  // when none can staff it (the slot is disabled and grayed), 'unknown' when
  // the probe failed (never silently shown as available).
  const [slotAvailability, setSlotAvailability] = useState({})
  // Probes are cached per date|service|duration|slot: reopening the picker
  // (which reloads hours and re-runs the probe effect) must not re-storm the
  // matcher — the cache keeps confirmed slots instantly rendered and only new
  // combinations are probed. Preliminary by design: the server revalidates.
  const probeCacheRef = useRef(new Map())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null) // created appointment ({ id, appointmentCode })
  // Payment choice inside the Review step: 'FULL' (default) or 'DOWN' — the
  // two Maya checkout options. The amounts are display-only; the server
  // computes the authoritative amount in integer centavos.
  const [paymentPlan, setPaymentPlan] = useState('FULL')
  // Public payment settings supply the server's deposit percent.
  const [paySettings, setPaySettings] = useState(null)
  // The deposit percent is a server setting the UI reads, never a local guess.
  const depositPercent = paySettings?.downPaymentKind === 'PERCENT' ? paySettings.downPaymentValue : null
  // The created Maya payment attempt (server view) while the checkout runs.
  const [mayaPayment, setMayaPayment] = useState(null)
  // True while the Maya checkout is being created (button spinner).
  const [startingPayment, setStartingPayment] = useState(false)
  // Hold countdown (seconds) while payment is pending.
  const [holdSeconds, setHoldSeconds] = useState(null)
  // One attempt token per booking submission: a retried checkout reuses it,
  // so the backend can never create a second payment attempt.
  const attemptTokenRef = useRef(null)
  // Shop hours drive the slot picker (GET /schedules/business-hours).
  const [hours, setHours] = useState(null) // business-hours rows, or null unknown
  const [hoursStatus, setHoursStatus] = useState('idle') // idle | loading | ready | error
  const [pickerOpen, setPickerOpen] = useState(false)
  // Bumped to force a fresh matching call without moving the date/time.
  const [matchNonce, setMatchNonce] = useState(0)
  const transitioningRef = useRef(false)
  const slideTimerRef = useRef(null)
  const contentRef = useRef(null)

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
        // The customer picks explicitly — nothing is auto-selected. A pick
        // that the fresh match no longer validates (different slot, no longer
        // available, no longer full-coverage) is cleared instead of silently
        // kept, and the warning that belonged to it goes too.
        const eligibleIds = new Set(
          [result.recommended, ...result.alternatives]
            .filter((entry) => entry && entry.coversAll !== false)
            .map((entry) => entry.id),
        )
        if (form.staffId && !eligibleIds.has(form.staffId)) {
          setSelectionWarning('')
          setForm((current) => ({ ...current, staffId: '' }))
        } else if (form.staffId) {
          setSelectionWarning('')
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

  // Probe every visible slot against the matcher whenever the date, service
  // or hours change, so a slot no stylist can staff is disabled and grayed
  // out immediately instead of leading to a dead end. Probes are pooled
  // (bounded concurrency), keyed on the current date, and cancelled on
  // change; a failed probe reports 'unknown' and is never shown as available.
  useEffect(() => {
    if (!form.date || !hours || !isBookableDate(form.date)) return undefined
    let cancelled = false
    const list = validSlots({ rows: hours, date: form.date, durationMinutes })
    const cacheKey = `${form.date}|${service.id}|${durationMinutes}`
    const results = {}
    const pending = []
    for (const slot of list) {
      const cached = probeCacheRef.current.get(`${cacheKey}|${slot}`)
      if (cached) results[slot] = cached
      else pending.push(slot)
    }
    // The probe-state reset is deliberately synchronous in this effect: the
    // grid must never render one frame with the previous date's slot states.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlotAvailability({ ...results })
    if (!pending.length) return () => { cancelled = true }
    let index = 0
    // Low concurrency on purpose: the selection request must not be starved
    // by the probe run on a slow backend (it did — 13-26s selection latency).
    const CONCURRENCY = 2
    async function worker() {
      while (!cancelled && index < pending.length) {
        const slot = pending[index]
        index += 1
        try {
          const data = await fetchMatching({ serviceIds: [service.id], date: form.date, startTime: slot })
          const candidates = [data?.recommended, ...(data?.alternatives ?? [])]
          results[slot] = candidates.some((entry) => entry && entry.coversAll !== false) ? 'bookable' : 'empty'
          probeCacheRef.current.set(`${cacheKey}|${slot}`, results[slot])
        } catch {
          results[slot] = 'unknown'
        }
        if (!cancelled) setSlotAvailability({ ...results })
      }
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()))
    return () => {
      cancelled = true
    }
  }, [form.date, service.id, hours, durationMinutes])

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
      // reset it instead of silently keeping it. The resets are deliberately
      // synchronous in this effect: stale pick state must never survive one
      // render after its slot disappeared.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((current) => ({ ...current, time: '', staffId: '' }))
      setMatch(null)
      setMatchStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, form.date, durationMinutes])

  // Matcher-validated staff for the chosen slot only — schedule, working
  // hours, existing bookings and specialty coverage all checked server-side —
  // and only full-coverage members: the list shows exactly who can perform the
  // selected service. The raw eligible-staff list is never selectable here
  // because its eligibility is not verified for this slot.
  const selectEntries = []
  const seenIds = new Set()
  for (const entry of [match?.recommended, ...(match?.alternatives ?? [])]) {
    if (entry && entry.coversAll !== false && !seenIds.has(entry.id)) {
      seenIds.add(entry.id)
      selectEntries.push(entry)
    }
  }

  // A pick the customer can actually make for this slot: at least one
  // full-coverage stylist is available.
  const hasEligibleStaff = selectEntries.length > 0

  function staffEntryFor(id) {
    if (!id) return null
    return selectEntries.find((entry) => entry.id === id) ?? null
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
        // No slot, no match, no validation: any pick is stale and is reset.
        setForm((current) => ({ ...current, staffId: '' }))
      } else {
        setMatchStatus('loading')
      }
    }
  }

  // Explicit stylist pick — the only way to choose one. A pick that covers
  // every service corrects the selection, so its stale warning goes too.
  function chooseStaff(entry) {
    if (entry.coversAll !== false) setSelectionWarning('')
    update('staffId', entry.id)
  }

  // A date the booking rules refuse (past, outside the three-month window, or
  // a closed day once hours are known) never becomes the selected date: the
  // choice is rejected with a clear message instead of silently accepted.
  function onDateChange(value) {
    const today = todayIso()
    const windowEnd = bookingWindowEndIso()
    if (value && (value < today || value > windowEnd)) {
      setError('That date is outside the booking window. Please choose a date within the next three months.')
      return
    }
    if (value && hours) {
      const row = hoursForDate(hours, value)
      if (!row || !row.isOpen) {
        setError(`The salon is closed on ${weekdayName(value)}. Please choose another day.`)
        return
      }
    }
    update('date', value)
  }

  // A6: every open of the picker re-fetches the shop hours and re-asks
  // matching for the current slot, so the list reflects live availability.
  function togglePicker() {
    setPickerOpen((open) => !open)
    void loadHours()
    if (form.date && form.time) setMatchNonce((nonce) => nonce + 1)
  }

  // A stale rendered slot can never be selected: the click re-validates it
  // against the freshest known hours before it reaches the form. The picker
  // stays open — the stylist list is right below it and the customer still
  // needs to pick a stylist; collapsing here reads as the UI breaking.
  function chooseSlot(slot) {
    if (!slots.includes(slot)) return
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
    // A stylist must be picked explicitly: no automatic choice and no
    // 'No preference' shortcut. A pick outside the validated match set may be
    // refused at booking, so it blocks here with the concern spelled out.
    const staffId = form.staffId || null
    const validatedIds = new Set(selectEntries.map((entry) => entry.id))
    const chosen = staffEntryFor(staffId)
    if (!staffId) {
      setSelectionWarning('Please choose a stylist before continuing.')
      return
    }
    if ((validatedIds.size > 0 && !validatedIds.has(staffId)) || chosen?.coversAll === false) {
      setSelectionWarning(
        'This stylist may not be scheduled at that time, or does not cover every service in this booking. Please choose an available stylist or another time.',
      )
      return
    }
    setSelectionWarning('')
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
    // Never POST a missing staffId: the customer's explicit pick is required
    // and anything else blocks the submit.
    const staffId = form.staffId || null
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
    // One attempt token per submission series: a retried checkout reuses the
    // same token, so the backend can only ever create one payment attempt.
    // A new attempt after a terminal one needs a fresh token.
    if (!attemptTokenRef.current || (mayaPayment && mayaPayment.status !== 'PENDING')) {
      attemptTokenRef.current = makeAttemptToken()
    }
    createAppointment({
      staffId,
      appointmentDate: form.date,
      startTime: form.time,
      serviceIds: [service.id],
    }).then(
      (data) => {
        const appointment = data?.appointment ?? data ?? {}
        setConfirmation(appointment)
        goToStep(3)
        startMayaPayment(appointment.id)
      },
      (err) => {
        setSubmitting(false)
        setError(bookingErrorMessage(err))
      },
    )
  }

  /* Starts the Maya payment attempt for the just-created booking and sends
   * the browser to the sandbox checkout. The booking is NEVER marked paid
   * here — only the server-side verification against Maya can do that. */
  function startMayaPayment(appointmentId) {
    if (!appointmentId) {
      setSubmitting(false)
      setStartingPayment(false)
      setError('Payment could not be started for this booking.')
      return
    }
    setStartingPayment(true)
    createMayaCheckout({
      appointmentId,
      plan: paymentPlan === 'DOWN' ? 'DOWN' : 'FULL',
      attemptToken: attemptTokenRef.current,
    }).then(
      (data) => {
        const payment = data?.payment ?? data ?? {}
        setMayaPayment(payment)
        setStartingPayment(false)
        setSubmitting(false)
        setHoldSeconds(payment.holdSecondsRemaining ?? null)
        if (payment.checkoutUrl) {
          window.location.assign(payment.checkoutUrl)
        }
      },
      (err) => {
        setStartingPayment(false)
        setSubmitting(false)
        setError(bookingErrorMessage(err) || 'Payment could not be started. The booking is saved — you can start payment again from Appointments.')
      },
    )
  }

  // The hold countdown ticks while the payment attempt is pending.
  useEffect(() => {
    if (!mayaPayment || mayaPayment.status !== 'PENDING') return undefined
    const timer = setInterval(() => {
      setHoldSeconds((value) => (value === null ? null : Math.max(0, value - 1)))
    }, 1000)
    return () => clearInterval(timer)
  }, [mayaPayment])

  function renderStep(number) {
    if (number === 3) {
      const paid = mayaPayment?.status === 'PAID'
      const awaiting = !paid
      return (
        <div className="px-6 py-12 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-(--gold) text-3xl text-(--gold)">✓</div>
          <h3 className="mt-5 font-(--serif) text-2xl text-(--gold)">{paid ? 'Booked' : `Thank you, ${user?.name || 'guest'}!`}</h3>
          {paid ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              {Number(mayaPayment?.outstanding ?? 0) <= 0
                ? 'Paid in full. Your appointment is confirmed.'
                : `Down payment paid: PHP ${Number(mayaPayment?.paidTotal ?? 0).toFixed(2)}, balance PHP ${Number(mayaPayment?.outstanding ?? 0).toFixed(2)} due at the salon.`}
            </p>
          ) : startingPayment ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Starting your payment…
            </p>
          ) : mayaPayment ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Awaiting payment. Your slot is held while you complete the Maya checkout.
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">
              Your appointment is reserved. Complete the Maya payment to confirm the booking.
            </p>
          )}
          {awaiting && mayaPayment?.status === 'PENDING' && holdSeconds !== null && (
            <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
              {holdCountdownText(holdSeconds)}
            </p>
          )}
          {error && <p className="mx-auto mt-3 max-w-sm text-xs text-[#e9a68c]" role="alert">{error}</p>}
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
            {paid ? (Number(mayaPayment?.outstanding ?? 0) <= 0 ? 'Payment: paid in full' : 'Payment: down payment paid') : 'Payment: awaiting payment'}
          </p>
          {confirmation?.appointmentCode && (
            <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
              Reference: {confirmation.appointmentCode}
            </p>
          )}
          {awaiting && !startingPayment && (
            <button type="button" onClick={() => startMayaPayment(confirmation?.id)} className="btn-pill mt-5 border border-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-(--gold)">
              {mayaPayment ? 'Open payment window' : 'Try payment again'}
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
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Date<input required type="date" min={todayIso()} max={bookingWindowEndIso()} value={form.date} onChange={(e) => onDateChange(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* unsupported: the icon still opens it */ } }} className="cursor-pointer rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
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
                  {form.time ? formatTime12(form.time) : 'Select a time'}
                </button>
              </div>
            </div>
            <p className="m-0 text-xs leading-5 text-[#bcb5a9]">
              {`Bookings are open for the next three months (through ${bookingWindowLabel()}).`}
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
                  <>
                  <div aria-label="Available start times" className="grid grid-cols-4 gap-2 max-[420px]:grid-cols-3" role="group">
                    {slots.map((slot) => {
                      const state = slotAvailability[slot] ?? 'checking'
                      // Only a confirmed-unavailable slot is disabled: a slot
                      // still being checked must stay clickable (the server
                      // revalidates on submit), otherwise a slow probe run
                      // makes every time slot unselectable.
                      const blocked = state === 'empty'
                      return (
                        <button
                          aria-pressed={form.time === slot}
                          aria-disabled={blocked}
                          disabled={blocked}
                          className={`btn-pill rounded border px-2 py-2 text-center text-xs tabular-nums ${blocked ? 'cursor-not-allowed border-[#2a2825] text-[#6b665e] opacity-60' : form.time === slot ? 'cursor-pointer border-(--gold) bg-(--gold) text-[#111]' : 'cursor-pointer border-[#3a3835] text-white hover:border-(--gold)'}`}
                          key={slot}
                          title={state === 'empty' ? 'No stylist is available for this time' : state === 'checking' ? 'Checking stylist availability…' : state === 'unknown' ? 'Availability could not be confirmed — your booking is re-checked before it is confirmed' : undefined}
                          onClick={() => chooseSlot(slot)}
                          type="button"
                        >
                          {formatTime12(slot)}
                        </button>
                      )
                    })}
                  </div>
                  {Object.values(slotAvailability).some((state) => state === 'empty') && (
                    <p className="m-0 mt-2 text-xs leading-5 text-[#8d877c]">Grayed times have no stylist available.</p>
                  )}
                  {Object.values(slotAvailability).some((state) => state === 'unknown') && (
                    <p className="m-0 mt-2 text-xs leading-5 text-[#e9a68c]" role="alert">
                      Stylist availability could not be confirmed for some times — your booking is re-checked before it is confirmed.
                    </p>
                  )}
                  </>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <p className="m-0 text-xs uppercase tracking-wider text-[#bcb5a9]" id="booking-stylist-label">Preferred stylist</p>
              {!form.time ? (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">Pick a time to see the stylists available for it.</p>
              ) : matchStatus === 'loading' ? (
                <p className="m-0 text-xs text-[#bcb5a9]" role="status">Finding the stylists available for this time…</p>
              ) : matchStatus === 'error' ? (
                <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">
                  We cannot verify stylist availability right now. Try again shortly.
                </p>
              ) : !hasEligibleStaff ? (
                <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">
                  No staff are available for this date and time. Choose another time or date.
                </p>
              ) : (
                <ul aria-labelledby="booking-stylist-label" className="m-0 grid list-none gap-2 p-0">
                  {selectEntries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-pressed={form.staffId === entry.id}
                        onClick={() => chooseStaff(entry)}
                        className={`w-full cursor-pointer rounded border p-3 text-left text-sm outline-none ${form.staffId === entry.id ? 'border-(--gold) bg-[rgba(212,180,92,0.14)] text-white' : 'border-[#3a3835] bg-[#1c1b18] text-white hover:border-(--gold) focus:border-(--gold)'}`}
                      >
                        <span className="block">{entry.firstName} {entry.lastName} · {entry.primaryRole}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#bcb5a9]">{alternativeLabel(entry, match?.needed ?? 0)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {matchStatus === 'ready' && match.reason && (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">{match.reason}</p>
              )}
              {matchStatus === 'ready' && hasEligibleStaff && !form.staffId && (
                <p className="m-0 text-xs leading-5 text-[#bcb5a9]">Choose one stylist to continue.</p>
              )}
              {selectionWarning && (
                <p className="m-0 text-xs leading-5 text-[#e9a68c]" role="alert">{selectionWarning}</p>
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
              <p className="m-0">Stylist: {chosenStaff ? `${chosenStaff.firstName} ${chosenStaff.lastName}` : 'No stylist selected'}</p>
              <p className="m-0">Total: <strong className="text-(--gold)\">{formatPeso(service.price)}</strong></p>
            </div>
            {selectionWarning && (
              <p className="m-0 rounded border border-[rgba(233,166,140,.4)] p-3 text-xs leading-5 text-[#e9a68c]" role="alert">{selectionWarning}</p>
            )}
            <fieldset className="m-0 grid gap-2 rounded border border-[rgba(212,180,92,.25)] p-4">
              <legend className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">Payment</legend>
              {(() => {
                // Display only (integer centavos, server percent); the server
                // computes the authoritative amount before the Maya checkout.
                const downAmount =
                  depositPercent != null ? Math.round(service.price * 100 * depositPercent / 100) / 100 : null
                const downPercent = depositPercent != null ? depositPercent : 40
                return [
                  ['FULL', `MAYA: PAY IN FULL (${formatPeso(service.price)})`],
                  ['DOWN', `MAYA: DOWN PAYMENT ${downPercent}% (${downAmount != null ? formatPeso(downAmount) : '…'})`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={paymentPlan === key}
                    onClick={() => setPaymentPlan(key)}
                    className={`min-h-[44px] w-full cursor-pointer rounded-full border px-5 text-left text-[12px] font-semibold tracking-[0.12em] uppercase ${paymentPlan === key ? 'border-(--gold) bg-(--gold) text-[#111]' : 'border-[#3a352c] text-[#d8d4cb] hover:border-(--gold)'} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))
              })()}
              <p className="m-0 mt-1 text-[10px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
                Amounts are display only; the server confirms them.
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
          <div><p className="m-0 text-[10px] uppercase tracking-[2px] text-(--gold)\">Royalty Salon</p><h2 id="booking-title" className="m-1 font-(--serif) text-2xl text-[#f3eee5]">{activeStep === 3 ? (mayaPayment?.status === 'PAID' ? 'Booking Confirmed' : 'Booking reserved') : activeStep === 2 ? 'Review your booking' : 'Book your appointment'}</h2></div>
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
    </>
  )
}

export default BookingFlow
