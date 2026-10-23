import { useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Dialog from '../components/Dialog.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useToast } from '../context/useToast.jsx'
import { seedAppointments, TIME_OPTIONS, STORAGE_KEY, loadPatches } from '../utils/appointments.js'

const tabs = [
  { id: 'upcoming', label: 'Upcoming', matches: (a) => a.status === 'CONFIRMED' || a.status === 'PENDING' },
  { id: 'past', label: 'Past', matches: (a) => a.status === 'COMPLETED' },
  { id: 'cancelled', label: 'Cancelled', matches: (a) => a.status === 'CANCELLED' },
]

const statusStyle = {
  CONFIRMED: 'appt-status--confirmed',
  PENDING: 'appt-status--pending',
  COMPLETED: 'appt-status--completed',
  CANCELLED: 'appt-status--cancelled',
}

function formatDateParts(iso) {
  const date = new Date(`${iso}T00:00:00`)
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
  }
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Review rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          aria-pressed={star === value}
          onClick={() => onChange && onChange(star)}
          className="text-2xl transition-transform hover:scale-110"
          style={{ color: star <= value ? 'var(--gold)' : '#4a4540' }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function Appointments() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState('upcoming')
  const [patches, setPatches] = useState(loadPatches)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const busyRef = useRef(false)

  // Demo-only persistence: owner-scoped patches over the shared seed records.
  const appointments = useMemo(() => {
    if (!user) return seedAppointments
    return seedAppointments.map((appointment) => {
      const patch = patches.find((p) => p.id === appointment.id && p.owner === user.email)
      return patch ? { ...appointment, ...patch.fields } : appointment
    })
  }, [patches, user])

  function openReviewModal(appointment) {
    setReviewTitle(appointment.service)
    setReviewText('')
    setReviewRating(5)
    setShowReviewModal(true)
  }

  function submitReview() {
    if (!reviewTitle.trim() || !reviewText.trim()) return
    const savedReviews = JSON.parse(localStorage.getItem('royalty-reviews') || '[]')
    savedReviews.push({
      id: `review-${Date.now()}`,
      service: reviewTitle.trim(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      rating: reviewRating,
      stylist: 'Anna Reyes',
      text: reviewText.trim(),
    })
    localStorage.setItem('royalty-reviews', JSON.stringify(savedReviews))
    setShowReviewModal(false)
    showToast('success', 'Your review has been saved.')
    navigate('/my-reviews')
  }

  // Writes are guarded by record identity and status eligibility; patches are
  // keyed to the signed-in mock customer, so another account's records stay
  // untouched even if a client-side id is tampered with.
  function applyChange(id, fields) {
    const record = seedAppointments.find((a) => a.id === id)
    if (!record || !user) return { ok: false, error: 'This appointment could not be found.' }
    const current = appointments.find((a) => a.id === id)
    if (!current || !['CONFIRMED', 'PENDING'].includes(current.status)) {
      return { ok: false, error: 'Only upcoming appointments can be changed.' }
    }
    const next = [...patches.filter((p) => !(p.id === id && p.owner === user.email)), { id, owner: user.email, fields }]
    setPatches(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return { ok: true }
  }

  function submitReschedule(date, time) {
    if (busyRef.current) return { ok: false, error: null }
    busyRef.current = true
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const chosen = new Date(`${date}T00:00:00`)
      if (!date || Number.isNaN(chosen.getTime())) return { ok: false, error: 'Choose a replacement date.' }
      if (!time) return { ok: false, error: 'Choose a replacement time.' }
      if (chosen < today) return { ok: false, error: 'Pick a date from today onwards.' }
      const result = applyChange(rescheduleTarget.id, { date, time })
      if (!result.ok) return result
      showToast('success', 'Appointment updated (demo) — saved in this browser only.')
      setRescheduleTarget(null)
      return { ok: true }
    } finally {
      busyRef.current = false
    }
  }

  function submitCancellation() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const result = applyChange(cancelTarget.id, { status: 'CANCELLED' })
      if (result.ok) {
        showToast('success', 'Appointment cancelled (demo) — saved in this browser only.')
        setActiveTab('cancelled')
      } else {
        showToast('error', result.error)
      }
      setCancelTarget(null)
    } finally {
      busyRef.current = false
    }
  }

  if (!user) return <Navigate to="/services" replace />

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  const visibleAppointments = appointments.filter(activeTabConfig.matches)
  const counts = {
    upcoming: appointments.filter(tabs[0].matches).length,
    past: appointments.filter(tabs[1].matches).length,
    cancelled: appointments.filter(tabs[2].matches).length,
  }
  const stats = [
    ['◫', String(appointments.length), 'Total Appointments'],
    ['◷', String(counts.upcoming), 'Upcoming'],
    ['☆', String(counts.past), 'Completed'],
    ['×', String(counts.cancelled), 'Cancelled'],
  ]

  return (
    <div className="min-h-screen bg-black text-[#eeeae2]">
      <main className="mx-auto w-[min(100%-82px,1200px)] py-[52px] max-[680px]:w-[min(100%-36px,1200px)] max-[680px]:py-9">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="m-0 font-[var(--serif)] text-[34px] leading-tight text-[var(--gold)] max-[680px]:text-[28px]">Appointments</h1>
            <p className="mt-1.5 text-[14px] text-[#b3ada2]">Your appointment overview</p>
            <p className="mt-1 text-[12px] text-[#8d877c]">Demo workspace — appointment changes are saved in this browser only.</p>
          </div>
          <button type="button" onClick={() => navigate('/services')} className="btn-pill rounded-full border border-[var(--gold)] bg-[var(--gold)] px-8 py-3 text-[13px] font-bold text-black hover:bg-[var(--gold-bright)]">BOOK NEW</button>
        </div>
        <div className="mb-8 grid grid-cols-4 gap-3 max-[800px]:grid-cols-2 max-[500px]:grid-cols-1">
          {stats.map(([icon, number, label]) => (
            <div key={label} className="flex min-h-[72px] items-center gap-3 rounded-lg border border-[rgba(212,180,92,.45)] bg-[#111] px-4">
              <span className="grid size-10 place-items-center rounded-full border border-[var(--gold)] text-xl text-[var(--gold)]">{icon}</span>
              <div><strong className="text-[22px] leading-none">{number}</strong><p className="m-0 mt-1 text-[12px] tracking-wide text-[#b3ada2]">{label}</p></div>
            </div>
          ))}
        </div>
        <div className="mb-5 flex gap-7 border-b border-[#27241f]" role="group" aria-label="Filter appointments">
          {tabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab.id}
              className={`cursor-pointer border-b-2 px-1 pb-3 text-[15px] transition-colors ${activeTab === tab.id ? 'border-[var(--gold)] font-semibold text-[var(--gold)]' : 'border-transparent text-[#b3ada2] hover:text-[#eeeae2]'}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label} ({counts[tab.id]})
            </button>
          ))}
        </div>
        <div className="space-y-3" aria-live="polite">
          {visibleAppointments.length === 0 && (
            <div className="rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]">
              <EmptyState
                actionLabel="Book an appointment"
                image="/images/empty-states/empty-booking.svg"
                message={
                  activeTab === 'cancelled'
                    ? 'You have no cancelled appointments.'
                    : activeTab === 'past'
                      ? 'Completed appointments will appear here.'
                      : 'You have no upcoming appointments yet.'
                }
                onAction={() => navigate('/services')}
                title="Nothing here yet"
              />
            </div>
          )}
          {visibleAppointments.map((appointment) => {
            const parts = formatDateParts(appointment.date)
            const changeable = appointment.status === 'CONFIRMED' || appointment.status === 'PENDING'
            return (
              <article key={appointment.id} className="flex items-center gap-5 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5 max-[800px]:flex-wrap max-[800px]:gap-4">
                <div className="w-16 shrink-0 border-r border-[#38332b] text-center max-[500px]:border-r-0">
                  <small className="text-[12px] tracking-[1.5px] text-[var(--gold)]">{parts.month}</small>
                  <div className="font-[var(--serif)] text-[28px] leading-tight">{parts.day}</div>
                </div>
                <div className="min-w-[180px] flex-1">
                  <h2 className="m-0 font-[var(--serif)] text-[21px] leading-snug">{appointment.service}</h2>
                  <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-[#b3ada2]">{parts.weekday} · {appointment.time} · {appointment.stylist}</p>
                </div>
                <strong className="text-[17px] text-[var(--gold)]">{appointment.price}</strong>
                <span className={`appt-status rounded-full border px-3.5 py-1.5 text-[12px] font-semibold tracking-[1px] ${statusStyle[appointment.status]}`}>{appointment.status}</span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {appointment.status === 'COMPLETED' ? (
                    <button type="button" onClick={() => openReviewModal(appointment)} className="btn-pill min-h-[40px] rounded-full border border-[#6b5b2e] px-5 text-[12px] font-semibold text-[var(--gold)]">WRITE REVIEW</button>
                  ) : changeable ? (
                    <>
                      <button type="button" onClick={() => setRescheduleTarget(appointment)} className="btn-pill min-h-[40px] rounded-full border border-[#6b5b2e] px-5 text-[12px] font-semibold text-[var(--gold)]">RESCHEDULE</button>
                      <button type="button" onClick={() => setCancelTarget(appointment)} className="btn-pill min-h-[40px] rounded-full border border-[#555] px-5 text-[12px] font-semibold text-[#ccc6bc]">CANCEL</button>
                    </>
                  ) : (
                    <span className="text-[13px] text-[#8d877c]">No actions available</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        {rescheduleTarget && (
          <RescheduleDialog
            appointment={appointments.find((a) => a.id === rescheduleTarget.id) ?? rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onSubmit={submitReschedule}
          />
        )}

        {cancelTarget && (
          <Dialog
            backdropClassName="bg-black/80 p-4 sm:p-8"
            labelledBy="cancel-dialog-title"
            onClose={() => setCancelTarget(null)}
            panelClassName="w-full max-w-[520px] rounded-[12px] border border-[rgba(212,180,92,0.5)] bg-[#171816] px-8 py-8 shadow-[0_20px_80px_rgba(0,0,0,.65)]"
          >
            <h2 id="cancel-dialog-title" className="m-0 font-[var(--serif)] text-[24px] text-[#f4f1eb]">Cancel this appointment?</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[#c9c3b9]">
              {cancelTarget.service} — {formatDateParts(cancelTarget.date).weekday}, {cancelTarget.date} at {cancelTarget.time} with {cancelTarget.stylist}.
            </p>
            <p className="mt-2 text-[13px] text-[#8d877c]">This is a demo change saved in this browser only.</p>
            <div className="mt-7 flex items-center justify-end gap-4">
              <button type="button" onClick={() => setCancelTarget(null)} className="btn-pill min-h-[44px] rounded-full border border-[#635b4c] px-6 text-[13px] font-semibold text-[#d5cdbf]">Keep appointment</button>
              <button type="button" onClick={submitCancellation} className="btn-pill min-h-[44px] rounded-full border border-[#8c4a4a] bg-[#8c4a4a] px-6 text-[13px] font-bold text-[#f8efef] hover:bg-[#a05656]">Cancel appointment</button>
            </div>
          </Dialog>
        )}

        {showReviewModal && (
          <Dialog
            backdropClassName="bg-black/80 p-4 sm:p-8"
            labelledBy="review-modal-title"
            onClose={() => setShowReviewModal(false)}
            panelClassName="w-full max-w-[1120px] border border-[rgba(212,180,92,0.55)] bg-[#171816] px-8 py-8 shadow-[0_20px_80px_rgba(0,0,0,.65)] sm:px-12 sm:py-9"
          >
            <div className="flex items-start justify-between gap-6">
              <p className="m-0 text-[12px] font-semibold tracking-[0.32em] text-(--gold) uppercase" id="review-modal-title">New review</p>
              <StarRating value={reviewRating} onChange={setReviewRating} />
            </div>

            <label htmlFor="review-title" className="sr-only">Review title</label>
            <input
              id="review-title"
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              className="mt-7 w-full border-0 bg-transparent p-0 font-(--serif) text-3xl font-light italic text-[#f4f1eb] outline-none placeholder:text-[#f4f1eb] sm:text-4xl"
              placeholder="New salon experience"
            />

            <label htmlFor="review-text" className="mt-10 mb-4 block text-[13px] tracking-[0.24em] text-[#b3ada2] uppercase">Tell us about your visit</label>
            <textarea
              id="review-text"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="What did you love about your experience?"
              rows={5}
              className="w-full resize-y border border-[rgba(212,180,92,0.35)] bg-[#0d0d0c] px-5 py-5 text-[16px] leading-relaxed text-[#f4f1eb] outline-none transition-colors placeholder:text-[#7f8994] focus:border-(--gold)"
            />

            <div className="mt-5 flex items-center justify-end gap-8">
              <button type="button" onClick={() => setShowReviewModal(false)} className="btn-pill min-h-[44px] cursor-pointer rounded-full border border-[#635b4c] px-6 text-[13px] font-semibold text-[#d5cdbf]">Cancel</button>
              <button type="button" onClick={submitReview} className="btn-pill min-h-[44px] cursor-pointer rounded-full border border-(--gold) bg-(--gold) px-7 text-[13px] font-bold tracking-[0.12em] text-[#111] uppercase transition-colors hover:bg-(--gold-bright)">Save review</button>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  )
}

function RescheduleDialog({ appointment, onClose, onSubmit }) {
  const parts = formatDateParts(appointment.date)
  const [date, setDate] = useState(appointment.date)
  const [time, setTime] = useState(appointment.time)
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    const result = onSubmit(date, time)
    if (result && !result.ok && result.error) setError(result.error)
  }

  return (
    <Dialog
      backdropClassName="bg-black/80 p-4 sm:p-8"
      labelledBy="reschedule-title"
      onClose={onClose}
      panelClassName="w-full max-w-[560px] rounded-[12px] border border-[rgba(212,180,92,0.5)] bg-[#171816] px-8 py-8 shadow-[0_20px_80px_rgba(0,0,0,.65)]"
    >
      <h2 id="reschedule-title" className="m-0 font-[var(--serif)] text-[24px] text-[#f4f1eb]">Reschedule appointment</h2>
      <p className="mt-4 text-[16px] leading-relaxed text-[#c9c3b9]">
        {appointment.service} with {appointment.stylist} — currently {parts.weekday}, {appointment.date} at {appointment.time} ({appointment.price}).
      </p>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        <label className="grid gap-2 text-[13px] font-semibold tracking-[1px] text-[#b3ada2] uppercase">
          New date
          <input
            required
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setError('') }}
            className="rounded-lg border border-[#3a3835] bg-[#1c1b18] p-3.5 text-[16px] normal-case tracking-normal text-white outline-none focus:border-(--gold)"
          />
        </label>
        <label className="grid gap-2 text-[13px] font-semibold tracking-[1px] text-[#b3ada2] uppercase">
          New time
          <select
            required
            value={time}
            onChange={(e) => { setTime(e.target.value); setError('') }}
            className="rounded-lg border border-[#3a3835] bg-[#1c1b18] p-3.5 text-[16px] normal-case tracking-normal text-white outline-none focus:border-(--gold)"
          >
            {TIME_OPTIONS.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        {error && <p className="m-0 text-[14px] text-[#e9a68c]" role="alert">{error}</p>}
        <p className="m-0 text-[13px] text-[#8d877c]">Demo change — saved in this browser only. Nothing is sent to the salon.</p>
        <div className="mt-2 flex items-center justify-end gap-4">
          <button type="button" onClick={onClose} className="btn-pill min-h-[44px] rounded-full border border-[#635b4c] px-6 text-[13px] font-semibold text-[#d5cdbf]">Keep as is</button>
          <button type="submit" className="btn-pill min-h-[44px] rounded-full border border-(--gold) bg-(--gold) px-7 text-[13px] font-bold tracking-[0.12em] text-[#111] uppercase hover:bg-(--gold-bright)">Save new time</button>
        </div>
      </form>
    </Dialog>
  )
}

export default Appointments
