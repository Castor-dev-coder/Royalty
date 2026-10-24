import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { useToast } from '../context/useToast.jsx'
import {
  ApiError,
  AuthError,
  cancelAppointmentRequest,
  fetchMyAppointments,
  sessionDispositionAfter401,
} from '../lib/api.js'
import ReviewForm from '../components/ReviewForm.jsx'

const PAGE_SIZE = 10

const STATUS_LABELS = {
  RESERVED: 'Pending',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
}

const tabs = [
  { id: 'upcoming', label: 'Upcoming', matches: (a) => a.status === 'RESERVED' || a.status === 'CONFIRMED' },
  // NO_SHOW is a past outcome, so it is grouped with Past alongside COMPLETED.
  { id: 'past', label: 'Past', matches: (a) => a.status === 'COMPLETED' || a.status === 'NO_SHOW' },
  { id: 'cancelled', label: 'Cancelled', matches: (a) => a.status === 'CANCELLED' },
]

function formatDateParts(iso) {
  const date = new Date(`${iso}T00:00:00`)
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    weekdayShort: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  }
}

const STATUS_BADGE_STYLES = {
  RESERVED: 'border-[rgba(212,180,92,0.45)] text-[var(--gold)]', // Pending — gold
  CONFIRMED: 'border-[#3a352c] text-[#b3ada2]',
  COMPLETED: 'border-[#3a352c] text-[#b3ada2]',
  CANCELLED: 'border-[#3a352c] text-[#b3ada2]',
  NO_SHOW: 'border-[#3a352c] text-[#b3ada2]',
}

// Text label plus color — never colour alone.
function StatusBadge({ status, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase ${STATUS_BADGE_STYLES[status] ?? 'border-[#3a352c] text-[#b3ada2]'} ${className}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function peso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function AppointmentCard({ item, onCancel, onOpenReview, onReviewSuccess, cancelMessage, cancelBusy, reviewOpen, onCloseReview }) {
  const { month, day, weekdayShort } = formatDateParts(item.appointmentDate)
  const staffName = item.staff ? `${item.staff.firstName} ${item.staff.lastName}`.trim() : 'Unassigned'
  const reviewed = item.alreadyReviewed && item.review
  const titleService = item.services[0]?.serviceName ?? 'Appointment'
  const moreCount = item.services.length - 1
  const showReviewButton = item.status === 'COMPLETED' && !item.alreadyReviewed && !reviewOpen
  const showCancel = item.status === 'RESERVED' || item.status === 'CONFIRMED'
  const hasActions = Boolean(showReviewButton || reviewed || showCancel)
  return (
    <article className="rounded-lg border border-[#27241f] bg-[#151515] px-6 py-6 max-[640px]:px-4 max-[640px]:py-4">
      {/* One 8px scale: 88px date column, 16px gutter, 8px row gaps. At <=640px
          the wrappers become display:contents so the leaves sit on the card
          grid: date chip + badge on the top row, content full width below. */}
      <div className="grid grid-cols-[88px_1fr] items-start gap-x-4 gap-y-2 min-[641px]:flex min-[641px]:gap-x-6">
        <time
          className="flex w-[88px] shrink-0 flex-col items-center gap-1 text-center max-[640px]:col-start-1 max-[640px]:row-start-1 min-[641px]:border-r min-[641px]:border-[#27241f] min-[641px]:pr-6"
          dateTime={item.appointmentDate}
        >
          <span className="text-[12px] font-semibold tracking-[0.14em] text-[var(--gold)]">{month}</span>
          <strong className="font-[var(--serif)] text-[28px] leading-none font-normal text-[#eeeae2]">{day}</strong>
          <span className="text-[12px] tracking-[0.14em] text-[#b3ada2]">{weekdayShort}</span>
        </time>

        <div className="contents min-[641px]:flex min-[641px]:min-w-0 min-[641px]:flex-1 min-[641px]:flex-col min-[641px]:gap-2">
          <div className="contents min-[641px]:flex min-[641px]:items-start min-[641px]:justify-between min-[641px]:gap-4">
            <h3 className="m-0 font-[var(--serif)] text-[21px] leading-snug text-[#eeeae2] max-[640px]:col-span-2 max-[640px]:col-start-1 max-[640px]:row-start-2">
              {titleService}
              {moreCount > 0 && (
                <span className="ml-2 font-sans text-[13px] tracking-[0.08em] text-[#b3ada2]">
                  +{moreCount} more
                </span>
              )}
            </h3>
            <StatusBadge
              className="max-[640px]:col-start-2 max-[640px]:row-start-1 max-[640px]:justify-self-end"
              status={item.status}
            />
          </div>

          <p className="m-0 text-[15px] leading-relaxed max-[640px]:col-span-2 max-[640px]:row-start-3">
            <span className="text-[#eeeae2]">{item.startTime} – {item.endTime}</span>
            <span className="text-[#b3ada2]"> · with {staffName}</span>
          </p>

          <ul className="m-0 flex list-none flex-col gap-2 border-t border-[#27241f] p-0 pt-2 text-[13px] max-[640px]:col-span-2 max-[640px]:row-start-4">
            {item.services.map((service) => (
              <li className="flex items-baseline justify-between gap-4" key={service.id ?? service.serviceId}>
                <span className="text-[#d8d4cb]">
                  {service.serviceName}
                  <span className="ml-2 text-[12px] text-[#b3ada2]">{service.durationMinutes} min</span>
                </span>
                <span className="tabular-nums text-[#d8d4cb]">{peso(service.price)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-[#27241f] pt-2 max-[640px]:col-span-2 max-[640px]:row-start-5">
            <span className="text-[12px] tracking-[0.14em] text-[#8d877c] uppercase">{item.appointmentCode}</span>
            <span className="flex items-baseline gap-2">
              <span className="text-[12px] text-[#8d877c]">Total</span>
              <strong className="text-[18px] font-semibold tabular-nums text-[var(--gold)]">{peso(item.totalAmount)}</strong>
            </span>
          </div>

          {hasActions && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 max-[640px]:col-span-2 max-[640px]:row-start-6">
              {showReviewButton && (
                <button
                  className="btn-pill min-h-[40px] cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-5 text-[12px] font-semibold tracking-[0.12em] text-[#111] uppercase hover:bg-[var(--gold-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] max-[640px]:min-h-[44px] max-[640px]:w-full"
                  onClick={() => onOpenReview(item.id)}
                  type="button"
                >
                  LEAVE A REVIEW
                </button>
              )}
              {reviewed && (
                <span className="text-[12px] font-semibold tracking-[0.12em] text-[#b3ada2] uppercase">
                  REVIEWED · {Number(item.review.overallRating).toFixed(1)}
                </span>
              )}
              {showCancel && (
                <button
                  className="btn-pill min-h-[40px] cursor-pointer rounded-full border border-[#3a352c] px-5 text-[12px] font-semibold tracking-[0.12em] text-[#b3ada2] uppercase hover:border-[#e9a68c] hover:text-[#e9a68c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-default disabled:opacity-60 max-[640px]:min-h-[44px] max-[640px]:w-full"
                  disabled={cancelBusy}
                  onClick={() => onCancel(item)}
                  type="button"
                >
                  {cancelBusy ? 'CANCELLING…' : 'CANCEL'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {cancelMessage && (
        <p className="m-0 mt-3 text-[13px] text-[#e9a68c]" role="alert">
          {cancelMessage}
        </p>
      )}
      {reviewOpen && (
        <div className="mt-5 border-t border-[#38332b] pt-5">
          <p className="m-0 mb-4 text-[12px] font-semibold tracking-[0.32em] text-[var(--gold)] uppercase">New review</p>
          <ReviewForm
            appointmentId={item.id}
            onDone={onCloseReview}
            onSuccess={(review) => onReviewSuccess(item.id, review)}
          />
        </div>
      )}
    </article>
  )
}

function Appointments() {
  const navigate = useNavigate()
  const { user, restoring, openAuth, resolveAuthFailure } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const { showToast } = useToast()

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [cancelState, setCancelState] = useState({}) // id -> { busy, message }
  const [reviewOpenId, setReviewOpenId] = useState(null)

  // Customer-only screen: other roles keep their session but get no data.
  const noAccess = Boolean(user) && user.role !== 'CUSTOMER'

  // The synchronous body never sets state (only promise callbacks do), so the
  // effect below cannot trigger cascading renders.
  const load = useCallback(() => {
    if (!user || user.role !== 'CUSTOMER') return
    fetchMyAppointments({ page, limit: PAGE_SIZE }).then(
      (result) => {
        setItems(result.appointments ?? [])
        setTotal(result.total ?? 0)
        setError(null)
        setLoading(false)
      },
      (err) => {
        void (async () => {
          if (err instanceof AuthError && err.status === 401) {
            // FE-01: only an invalid/expired token clears the session.
            const disposition = await sessionDispositionAfter401(user.role)
            await resolveAuthFailure(disposition)
            setLoading(false)
            return
          }
          if (err instanceof ApiError && err.kind === 'no-access') {
            setError('Your account does not have access to this page.')
          } else {
            setError(err instanceof ApiError ? err.message : 'Could not load your appointments.')
          }
          setLoading(false)
        })()
      },
    )
  }, [user, page, resolveAuthFailure])

  useEffect(() => {
    load()
  }, [load, recoveryTick])

  async function handleCancel(item) {
    setCancelState((current) => ({ ...current, [item.id]: { busy: true, message: null } }))
    try {
      await cancelAppointmentRequest(item.id)
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: 'CANCELLED' } : row)))
      setCancelState((current) => ({ ...current, [item.id]: { busy: false, message: null } }))
      showToast('success', 'Appointment cancelled.')
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) {
        const disposition = await sessionDispositionAfter401(user?.role)
        await resolveAuthFailure(disposition)
        return
      }
      const message =
        err instanceof ApiError && err.kind === 'conflict'
          ? 'This appointment can no longer be cancelled.'
          : err instanceof ApiError && err.kind === 'no-access'
            ? 'Your account cannot cancel this appointment.'
            : 'Could not cancel the appointment. Try again.'
      setCancelState((current) => ({ ...current, [item.id]: { busy: false, message } }))
    }
  }

  function handleReviewSuccess(itemId, review) {
    setReviewOpenId(null)
    if (!review) {
      // 409 "already reviewed": tell the user, then refresh the item state.
      showToast('info', 'You already reviewed this visit.')
      load()
      return
    }
    setItems((current) =>
      current.map((row) =>
        row.id === itemId
          ? {
              ...row,
              alreadyReviewed: true,
              review: {
                overallRating: review.overallRating ?? review.rating ?? 0,
                ratings: review.ratings ?? null,
                comment: review.comment ?? null,
              },
            }
          : row,
      ),
    )
    showToast('success', 'Your review has been saved.')
  }

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  const visibleAppointments = items.filter(activeTabConfig.matches)
  const counts = {
    upcoming: items.filter(tabs[0].matches).length,
    past: items.filter(tabs[1].matches).length,
    cancelled: items.filter(tabs[2].matches).length,
  }
  const stats = [
    ['◫', String(total), 'Total Appointments'],
    ['◷', String(counts.upcoming), 'Upcoming'],
    ['☆', String(counts.past), 'Completed'],
    ['×', String(counts.cancelled), 'Cancelled'],
  ]
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-black text-[#eeeae2]">
      <main className="mx-auto w-[min(100%-82px,1200px)] py-[52px] max-[680px]:w-[min(100%-36px,1200px)] max-[680px]:py-9">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="m-0 font-[var(--serif)] text-[34px] leading-tight text-[var(--gold)] max-[680px]:text-[28px]">Appointments</h1>
            <p className="mt-1.5 text-[14px] text-[#b3ada2]">Your appointment overview</p>
          </div>
          <button type="button" onClick={() => navigate('/services')} className="btn-pill rounded-full border border-[var(--gold)] bg-[var(--gold)] px-8 py-3 text-[13px] font-bold text-black hover:bg-[var(--gold-bright)]">BOOK NEW</button>
        </div>

        {!user && restoring && (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="h-[150px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
            <div className="h-[150px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
          </div>
        )}

        {!user && !restoring && (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
            <p className="m-0 text-[15px] text-[#d8d4cb]">Sign in to see your appointments.</p>
            <button
              className="btn-pill cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-7 py-3 text-[13px] font-bold text-black hover:bg-[var(--gold-bright)]"
              onClick={() => openAuth('login')}
              type="button"
            >
              SIGN IN
            </button>
          </div>
        )}

        {user && noAccess && (
          <div className="rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
            <p className="m-0 text-[15px] text-[#d8d4cb]" role="status">
              No access: this page is for customer accounts. You are signed in as {user.role.toLowerCase()}.
            </p>
          </div>
        )}

        {user && !noAccess && (
          <>
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
              {loading && (
                <>
                  <div className="h-[150px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
                  <div className="h-[150px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
                </>
              )}

              {!loading && error && (
                <div className="flex flex-col items-start gap-4 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
                  <p className="m-0 text-[15px] text-[#e9a68c]" role="alert">{error}</p>
                  <button
                    className="cursor-pointer rounded-full border border-[#635b4c] px-6 py-2.5 text-[12px] font-semibold tracking-[0.12em] text-[#d5cdbf] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2]"
                    onClick={load}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loading && !error && visibleAppointments.length === 0 && (
                <div className="flex flex-col items-start gap-4 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
                  <p className="m-0 text-[15px] text-[#d8d4cb]" role="status">
                    {total === 0
                      ? 'No appointments yet. Book your first visit — your hair, your rules.'
                      : `No ${activeTabConfig.label.toLowerCase()} appointments.`}
                  </p>
                  {total === 0 && (
                    <button
                      className="btn-pill cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-7 py-3 text-[13px] font-bold text-black hover:bg-[var(--gold-bright)]"
                      onClick={() => navigate('/services')}
                      type="button"
                    >
                      BOOK NOW
                    </button>
                  )}
                </div>
              )}

              {!loading && !error && (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {visibleAppointments.map((item) => (
                    <li className="list-none" key={item.id}>
                      <AppointmentCard
                        cancelBusy={Boolean(cancelState[item.id]?.busy)}
                        cancelMessage={cancelState[item.id]?.message}
                        item={item}
                        onCancel={handleCancel}
                        onCloseReview={() => setReviewOpenId(null)}
                        onOpenReview={(id) => setReviewOpenId(id)}
                        onReviewSuccess={handleReviewSuccess}
                        reviewOpen={reviewOpenId === item.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!loading && !error && totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  className="cursor-pointer rounded-full border border-[#635b4c] px-5 py-2 text-[12px] font-semibold tracking-[0.12em] text-[#d5cdbf] uppercase disabled:cursor-default disabled:opacity-50 hover:border-[var(--gold)]"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  type="button"
                >
                  Previous
                </button>
                <span className="text-[12px] text-[#8d877c]">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="cursor-pointer rounded-full border border-[#635b4c] px-5 py-2 text-[12px] font-semibold tracking-[0.12em] text-[#d5cdbf] uppercase disabled:cursor-default disabled:opacity-50 hover:border-[var(--gold)]"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Appointments
