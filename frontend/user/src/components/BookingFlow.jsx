import { useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'
import { ApiError, createAppointment, fetchEligibleStaff } from '../lib/api.js'

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

function BookingFlow({ service, user, onClose }) {
  const [step, setStep] = useState(1)
  const [slide, setSlide] = useState(null) // { from, to, dir } while swiping
  const [form, setForm] = useState({ staffId: '', date: '', time: '' })
  const [staff, setStaff] = useState([])
  const [staffStatus, setStaffStatus] = useState('loading') // loading | ready | missing
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null) // { appointmentCode }
  const transitioningRef = useRef(false)
  const slideTimerRef = useRef(null)
  const contentRef = useRef(null)

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

  // Real eligible staff for this service (POST /appointments requires staffId).
  useEffect(() => {
    let stale = false
    fetchEligibleStaff([service.id]).then(
      (data) => {
        if (stale) return
        const rows = data?.staff ?? []
        setStaff(rows)
        setStaffStatus(rows.length > 0 ? 'ready' : 'missing')
        if (rows.length > 0) setForm((current) => ({ ...current, staffId: current.staffId || rows[0].id }))
      },
      () => {
        if (!stale) setStaffStatus('missing')
      },
    )
    return () => {
      stale = true
    }
  }, [service.id])

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
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
    if (!form.staffId || !form.date || !form.time) {
      setError('Please complete the required fields before continuing.')
      return
    }
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

    return (
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center gap-3 rounded border border-[rgba(212,180,92,.35)] bg-[#181612] p-3"><SafeImage className="size-14 rounded object-cover" src={undefined} alt="" /><div><p className="m-0 font-(--serif) text-lg text-[#f3eee5]">{service.name}</p><p className="m-0 mt-1 text-xs text-(--gold)">{service.durationMinutes} MIN · {formatPeso(service.price)}</p></div></div>
        {staffStatus === 'missing' ? (
          <div className="grid gap-4 text-center">
            <p className="m-0 text-sm leading-6 text-[#bbb6ad]" role="alert">
              Online booking is not available for this service yet — no eligible staff can be assigned.
            </p>
            <button type="button" onClick={onClose} className="btn-pill border border-(--gold) bg-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Close</button>
          </div>
        ) : number === 1 ? (
          <form className="grid gap-4" onSubmit={continueToReview}>
            <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Preferred stylist
              <select required value={form.staffId} onChange={(e) => update('staffId', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-(--gold)">
                {staffStatus === 'loading' && <option value="">Loading stylists…</option>}
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.primaryRole}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Date<input required type="date" min={todayIso()} value={form.date} onChange={(e) => update('date', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Time<input required type="time" value={form.time} onChange={(e) => update('time', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-(--gold)" /></label>
            </div>
            {error && <p className="m-0 text-xs text-[#e9a68c]" role="alert">{error}</p>}
            <button className="btn-pill mt-2 border border-(--gold) bg-(--gold) px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Review booking</button>
          </form>
        ) : (
          <div className="grid gap-5">
            <div className="rounded border border-[rgba(212,180,92,.25)] p-4 text-sm leading-7 text-[#cbc5ba]">
              <p className="m-0 text-xs uppercase tracking-wider text-(--gold)">Appointment summary</p>
              <p className="m-0 mt-2">{form.date} at {form.time}</p>
              <p className="m-0">Stylist: {staff.find((member) => member.id === form.staffId)?.firstName} {staff.find((member) => member.id === form.staffId)?.lastName}</p>
              <p className="m-0">Total: <strong className="text-(--gold)">{formatPeso(service.price)}</strong></p>
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
          <div><p className="m-0 text-[10px] uppercase tracking-[2px] text-(--gold)">Royalty Salon</p><h2 id="booking-title" className="m-1 font-(--serif) text-2xl text-[#f3eee5]">{activeStep === 3 ? 'Booking Confirmed' : activeStep === 2 ? 'Review your booking' : 'Book your appointment'}</h2></div>
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
