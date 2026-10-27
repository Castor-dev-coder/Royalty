import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomerInitials from '../components/CustomerInitials.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { useAutoRefresh } from '../lib/useAutoRefresh.js'
import { useToast } from '../context/useToast.jsx'
import {
  ApiError,
  AuthError,
  NOT_MODIFIED,
  cancelAppointmentRequest,
  fetchMyAppointments,
  fetchMyPayments,
  sessionDispositionAfter401,
} from '../lib/api.js'
import ReviewForm from '../components/ReviewForm.jsx'
import GCashPaymentDialog from '../components/GCashPaymentDialog.jsx'
import { formatAmount, groupPaymentsByAppointment, paymentStatusLabel, shouldShowPay } from '../lib/payments.js'

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

const PAYMENT_BADGE_STYLES = {
  UNVERIFIED: 'border-[rgba(212,180,92,0.45)] text-[var(--gold)]',
  VERIFIED: 'border-[#2f4a33] text-[#9fd0a5]',
  REJECTED: 'border-[#4a2f28] text-[#e9a68c]',
}

// Text label plus color — never colour alone.
function PaymentStatusChip({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase ${PAYMENT_BADGE_STYLES[status] ?? 'border-[#3a352c] text-[#b3ada2]'}`}
    >
      {paymentStatusLabel(status)}
    </span>
  )
}

function peso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function formatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function AppointmentCard({ item, customerName, outstanding, onCancel, onOpenPayment, onOpenReview, onReviewSuccess, cancelMessage, cancelBusy, reviewOpen, onCloseReview }) {
  const { month, day, weekdayShort } = formatDateParts(item.appointmentDate)
  const staffName = item.staff ? `${item.staff.firstName} ${item.staff.lastName}`.trim() : 'Unassigned'
  const reviewed = item.alreadyReviewed && item.review
  const titleService = item.services[0]?.serviceName ?? 'Appointment'
  const moreCount = item.services.length - 1
  const showReviewButton = item.status === 'COMPLETED' && !item.alreadyReviewed && !reviewOpen
  const showCancel = item.status === 'RESERVED' || item.status === 'CONFIRMED'
  // PAY WITH GCASH for pay-at-salon bookings and anything unpaid or partly
  // paid; hidden for cancelled, no-show and fully paid. The server quote gates
  // what can actually be paid.
  const showPay = shouldShowPay(item.status, outstanding)
  const hasActions = Boolean(showPay || showReviewButton || reviewed || showCancel)
  return (
    <article className="rounded-lg border border-[#27241f] bg-[#151515] px-6 py-6 max-[640px]:px-4 max-[640px]:py-4">
      {/* Customer identity is initials only — never a photo; the name is
          always real text beside the (aria-hidden) mark. */}
      <div className="mb-3 flex items-center gap-2">
        <CustomerInitials className="size-8 text-[12px]" name={customerName} />
        <span className="text-[13px] text-[#d8d4cb]">{customerName}</span>
      </div>
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
              {showPay && (
                <button
                  className="btn-pill min-h-[40px] cursor-pointer rounded-full border border-[var(--gold)] px-5 text-[12px] font-semibold tracking-[0.12em] text-[var(--gold)] uppercase hover:bg-[var(--gold)] hover:text-[#111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] max-[640px]:min-h-[44px] max-[640px]:w-full"
                  onClick={() => onOpenPayment(item)}
                  type="button"
                >
                  PAY WITH GCASH
                </button>
              )}
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
            onSuccess={(review, options) => onReviewSuccess(item.id, review, options)}
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
  const [payItem, setPayItem] = useState(null) // appointment opened in the GCash dialog
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState(null)

  // Customer-only screen: other roles keep their session but get no data.
  const noAccess = Boolean(user) && user.role !== 'CUSTOMER'

  // Rows are on screen after the first successful load — background refreshes
  // update them in place and never replace them with a skeleton or an error.
  const hasDataRef = useRef(false)
  const hasPaymentsRef = useRef(false)

  // The synchronous body never sets state (only promise callbacks do), so the
  // effect below cannot trigger cascading renders. Resolves true on success
  // (including a 304 that changed nothing) for the auto-refresh scheduler.
  const load = useCallback(() => {
    if (!user || user.role !== 'CUSTOMER') return Promise.resolve(true)
    return fetchMyAppointments({ page, limit: PAGE_SIZE }).then(
      (result) => {
        // 304 on the conditional GET: what's on screen is still current.
        if (result !== NOT_MODIFIED) {
          setItems(result.appointments ?? [])
          setTotal(result.total ?? 0)
          hasDataRef.current = true
          setError(null)
        }
        setLoading(false)
        return true
      },
      (err) =>
        (async () => {
          if (err instanceof AuthError && err.status === 401) {
            // FE-01: only an invalid/expired token clears the session.
            const disposition = await sessionDispositionAfter401(user.role)
            await resolveAuthFailure(disposition)
            setLoading(false)
            return false
          }
          // A failed background refresh keeps the rows already on screen —
          // the outage banner explains staleness. Only a page with nothing to
          // show takes over with the error panel.
          if (!hasDataRef.current) {
            if (err instanceof ApiError && err.kind === 'no-access') {
              setError('Your account does not have access to this page.')
            } else {
              setError(err instanceof ApiError ? err.message : 'Could not load your appointments.')
            }
          }
          setLoading(false)
          return false
        })(),
    )
  }, [user, page, resolveAuthFailure])

  // Payment history loader — same FE-01 discipline as `load`: setState only
  // in promise callbacks, keep rows on screen through transient failures.
  const loadPayments = useCallback(() => {
    if (!user || user.role !== 'CUSTOMER') return Promise.resolve(true)
    return fetchMyPayments().then(
      (result) => {
        setPayments(result?.payments ?? [])
        setPaymentsError(null)
        hasPaymentsRef.current = true
        setPaymentsLoading(false)
        return true
      },
      (err) =>
        (async () => {
          if (err instanceof AuthError && err.status === 401) {
            const disposition = await sessionDispositionAfter401(user.role)
            await resolveAuthFailure(disposition)
            setPaymentsLoading(false)
            return false
          }
          if (!hasPaymentsRef.current) {
            setPaymentsError(err instanceof ApiError ? err.message : 'Could not load your payments.')
          }
          setPaymentsLoading(false)
          return false
        })(),
    )
  }, [user, resolveAuthFailure])

  // Appointments and payments share one lifecycle (auto-refresh, outage
  // recovery) — the combined callback keeps both fresh together.
  const refreshAll = useCallback(
    () => Promise.all([load(), loadPayments()]).then((results) => results.every(Boolean)),
    [load, loadPayments],
  )

  useEffect(() => {
    refreshAll()
  }, [refreshAll, recoveryTick])

  // Signed-in background refresh (focus / online / 45s ±5s jitter). Skipped
  // while a review form/draft, the payment dialog, or a cancel is in flight.
  const cancelBusy = Object.values(cancelState).some((entry) => entry?.busy)
  useAutoRefresh(refreshAll, {
    enabled: Boolean(user) && user.role === 'CUSTOMER',
    paused: reviewOpenId !== null || payItem !== null || cancelBusy,
  })

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

  function handleReviewSuccess(itemId, review, options = {}) {
    // With a photo phase pending, the panel stays open so failed photos can
    // be retried — the saved review is never resubmitted either way.
    if (!options.photoPhase) setReviewOpenId(null)
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
                        customerName={user.name || user.email || 'Guest'}
                        item={item}
                        outstanding={(payments.find((row) => row.appointmentId === item.id) ?? null)?.outstanding ?? null}
                        onCancel={handleCancel}
                        onCloseReview={() => setReviewOpenId(null)}
                        onOpenPayment={setPayItem}
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

            <section aria-labelledby="payment-history-heading" className="mt-12">
              <h2 className="m-0 font-[var(--serif)] text-[26px] leading-tight text-[var(--gold)] max-[680px]:text-[22px]" id="payment-history-heading">
                Payment history
              </h2>
              {paymentsLoading && (
                <div aria-busy="true" className="mt-4 h-[120px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
              )}
              {!paymentsLoading && paymentsError && (
                <div className="mt-4 flex flex-col items-start gap-4 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
                  <p className="m-0 text-[15px] text-[#e9a68c]" role="alert">
                    {paymentsError}
                  </p>
                  <button
                    className="cursor-pointer rounded-full border border-[#635b4c] px-6 py-2.5 text-[12px] font-semibold tracking-[0.12em] text-[#d5cdbf] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2]"
                    onClick={() => {
                      setPaymentsLoading(true)
                      loadPayments()
                    }}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              )}
              {!paymentsLoading && !paymentsError && payments.length === 0 && (
                <p className="mt-4 text-[15px] text-[#d8d4cb]" role="status">
                  No payments yet.
                </p>
              )}
              {!paymentsLoading && !paymentsError && payments.length > 0 && (
                <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
                  {groupPaymentsByAppointment(payments).map((group) => (
                    <li className="list-none" key={group.appointmentId ?? group.appointmentCode}>
                      <article className="rounded-lg border border-[#27241f] bg-[#151515] px-6 py-5 max-[640px]:px-4">
                        <h3 className="m-0 text-[13px] font-semibold tracking-[0.14em] text-[#8d877c] uppercase">
                          {group.appointmentCode || 'Appointment'}
                        </h3>
                        {/* Balance summary — the server's numbers, copied verbatim. */}
                        <dl className="m-0 mt-3 flex flex-col gap-2 border-b border-[#27241f] pb-3">
                          {[
                            ['Total', group.appointmentTotal],
                            ['Verified received', group.verifiedTotal],
                            ['Outstanding', group.outstanding],
                          ]
                            .filter(([, value]) => value !== null && value !== undefined)
                            .map(([label, value]) => (
                              <div className="flex items-baseline justify-between gap-4" key={label}>
                                <dt className="m-0 text-[12px] tracking-[0.14em] text-[#8d877c] uppercase">{label}</dt>
                                <dd className="m-0 text-[14px] tabular-nums text-[#d8d4cb]">{formatAmount(value)}</dd>
                              </div>
                            ))}
                        </dl>
                        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                          {group.transactions.map((payment) => (
                            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" key={payment.id}>
                              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                                <strong className="text-[15px] font-semibold tabular-nums text-[#eeeae2]">{formatAmount(payment.amount)}</strong>
                                <span className="text-[#b3ada2]">
                                  {payment.paymentMethod}
                                  {payment.channel ? ` · ${payment.channel === 'ONLINE' ? 'Online' : 'At the salon'}` : ''}
                                </span>
                                {payment.referenceNo && <span className="text-[12px] text-[#8d877c]">Ref {payment.referenceNo}</span>}
                                {payment.createdAt && (
                                  <time className="text-[12px] text-[#8d877c]" dateTime={payment.createdAt}>
                                    {formatTimestamp(payment.createdAt)}
                                  </time>
                                )}
                              </span>
                              <PaymentStatusChip status={payment.status} />
                            </li>
                          ))}
                        </ul>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {payItem && (
              <GCashPaymentDialog
                item={payItem}
                onClose={() => setPayItem(null)}
                onSubmitted={() => {
                  load()
                  loadPayments()
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Appointments
