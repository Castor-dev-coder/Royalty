import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'
import SignInPanel from '../components/SignInPanel.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { useAutoRefresh } from '../lib/useAutoRefresh.js'
import { NOT_MODIFIED, fetchMyAppointments } from '../lib/api.js'

// Status wording mirrors Appointments.jsx so the two pages never disagree.
const STATUS_LABELS = {
  RESERVED: 'Pending',
  CONFIRMED: 'Booked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
}

// Each notification is a mechanical restatement of one real appointment row
// from GET /appointments/mine. There is no notifications feed endpoint yet
// (FE gap, surfaced on the page itself): the title maps the row's actual
// status and the body names its actual service and date — nothing invented.
const STATUS_UPDATES = {
  RESERVED: { title: 'Booking requested', icon: 'clock' },
  CONFIRMED: { title: 'Booking confirmed', icon: 'check' },
  COMPLETED: { title: 'Appointment completed', icon: 'sparkle' },
  CANCELLED: { title: 'Booking cancelled', icon: 'x' },
  NO_SHOW: { title: 'Missed appointment', icon: 'alert' },
}

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toUpdate(item) {
  const update = STATUS_UPDATES[item.status] ?? { title: 'Appointment update', icon: 'bell' }
  return {
    id: item.id,
    title: update.title,
    icon: update.icon,
    service: item.services.map((s) => s.serviceName).join(', ') || 'Appointment',
    date: formatDate(item.appointmentDate),
    statusLabel: STATUS_LABELS[item.status] ?? item.status,
    canReview: item.status === 'COMPLETED' && !item.alreadyReviewed,
  }
}

function UpdateIcon({ name }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    sparkle: <><circle cx="12" cy="12" r="8" /><path d="M12 8.5v7M8.5 12h7" /></>,
    x: <><circle cx="12" cy="12" r="8" /><path d="m9.5 9.5 5 5m0-5-5 5" /></>,
    alert: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5M12 15.5v.5" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M9.5 21h5" /></>,
  }
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[rgba(212,180,92,0.45)] text-[var(--gold)]" aria-hidden="true">
      <svg className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.5]" viewBox="0 0 24 24">
        {paths[name] ?? paths.bell}
      </svg>
    </span>
  )
}

function Notifications() {
  const { user, restoring } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Customer-only screen: other roles keep their session but get no data.
  const noAccess = Boolean(user) && user.role !== 'CUSTOMER'

  // Rows already on screen survive background refreshes untouched.
  const hasDataRef = useRef(false)
  // Switching accounts must never show the previous account's updates.
  const ownerKey = user?.email ?? null
  useEffect(() => {
    // Deliberate synchronous reset (same pattern as Appointments.jsx): the
    // previous account's rows must not survive even one render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdates([])
    hasDataRef.current = false
    setError(null)
    setLoading(true)
  }, [ownerKey])

  // The synchronous body never sets state — only the promise callbacks do.
  const load = useCallback(() => {
    if (!user || user.role !== 'CUSTOMER') return Promise.resolve(true)
    return fetchMyAppointments({ page: 1, limit: 20 }).then(
      (data) => {
        // 304 on the conditional GET: what's on screen is still current.
        if (data !== NOT_MODIFIED) {
          setUpdates((data?.appointments ?? []).map(toUpdate))
          hasDataRef.current = true
          setError(null)
        }
        setLoading(false)
        return true
      },
      () => {
        // Keep rows already on screen; the outage banner explains staleness.
        if (!hasDataRef.current) setError('Could not load your notifications.')
        setLoading(false)
        return false
      },
    )
  }, [user])

  useEffect(() => {
    void load()
  }, [load, recoveryTick])

  // Signed-in background refresh (focus / online / 45s ±5s jitter).
  useAutoRefresh(load, { enabled: Boolean(user) && !noAccess })

  return (
    <main className="min-h-[calc(100vh-76px)] bg-black">
      <section className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[30px] max-[680px]:pb-[58px]">
        <div className="mb-8">
          <span className="type-section-eyebrow text-[var(--gold)]">
            YOUR UPDATES
          </span>
          <h1 className="m-0 mt-2 font-[var(--serif)] text-[34px] leading-tight text-[var(--gold)] max-[680px]:text-[28px]">
            Notifications
          </h1>
          <p className="mt-1.5 text-[14px] text-[#c0bbb2]">
            Everything that happened with your appointments, in one place
          </p>
        </div>

        {restoring && (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
            <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
          </div>
        )}

        {!restoring && !user && (
          <SignInPanel action="view your notifications" />
        )}

        {!restoring && user && noAccess && (
          <div className="rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
            <p className="m-0 text-[15px] text-[#d8d1c5]" role="status">
              No access: this page is for customer accounts. You are signed
              in as {user.role.toLowerCase()}.
            </p>
          </div>
        )}

        {!restoring && user && !noAccess && (
          <>
            {/* Honest gap note: no push/email feed exists yet (FE gap). */}
            <div className="mb-6 rounded-[14px] border border-[rgba(212,180,92,0.22)] bg-[#151515] px-5 py-4">
              <p className="m-0 text-[13px] leading-[1.6] text-[#c0bbb2]">
                <strong className="font-semibold text-[var(--gold)]">How this works: </strong>
                these updates are summarized from your real appointment
                records. Live push and email alerts are not available yet —
                a dedicated notifications feed is a backend gap.
              </p>
            </div>

            {error && updates.length === 0 && (
              <div className="rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-6 py-5">
                <p className="m-0 text-[15px] text-[#d8d1c5]" role="status">
                  {error}
                </p>
              </div>
            )}

            {!error && loading && updates.length === 0 && (
              <div className="flex flex-col gap-3" aria-busy="true">
                <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
                <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
              </div>
            )}

            {!loading && !error && updates.length === 0 && (
              <EmptyState
                image="/images/empty-states/empty-search.svg"
                message="News about your bookings will appear here. Book an appointment to get started."
                title="No updates yet"
              />
            )}

            {updates.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {updates.map((update) => (
                  <li
                    className="flex items-start gap-4 rounded-[14px] border border-[rgba(212,180,92,0.22)] bg-[#151515] px-5 py-4"
                    key={update.id}
                  >
                    <UpdateIcon name={update.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="m-0 text-[16px] font-semibold text-[#f6f2ea]">
                          {update.title}
                        </h2>
                        <span className="inline-flex items-center rounded-full border border-[rgba(212,180,92,0.45)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--gold)] uppercase">
                          {update.statusLabel}
                        </span>
                      </div>
                      <p className="m-0 mt-1 text-[14px] leading-[1.6] text-[#c0bbb2]">
                        Your {update.service} appointment on {update.date} is
                        now {update.statusLabel.toLowerCase()}.
                        {update.canReview &&
                          ' You can write a review for this visit.'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {updates.length > 0 && (
              <div className="mt-8 flex justify-center">
                <Link
                  className="btn-pill inline-flex min-h-[46px] items-center justify-center rounded-full border border-[var(--gold)] bg-transparent px-[1.4rem] py-[0.8rem] text-(--text) no-underline hover:bg-[rgba(212,180,92,.14)]"
                  to="/appointments"
                >
                  View All Appointments
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default Notifications
