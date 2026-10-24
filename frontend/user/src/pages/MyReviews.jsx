import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { fetchMyAppointments } from '../lib/api.js'

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Stars({ value }) {
  return (
    <div className="flex items-center gap-0.5 text-(--gold)" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          aria-hidden="true"
          className={`size-3.5 ${i < value ? 'fill-current' : 'fill-none stroke-current'}`}
          fill={i < value ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2.5l2.95 6 6.6.95-4.78 4.66 1.13 6.58L12 17.77l-5.9 2.92 1.13-6.58L2.45 9.45l6.6-.95L12 2.5z"
          />
        </svg>
      ))}
    </div>
  )
}

// The customer's own reviews, derived from GET /appointments/mine (there is no
// dedicated "my reviews" endpoint — FE gap). Only real review rows appear.
function toMyReview(item) {
  const review = item.review
  return {
    id: review.id ?? item.id,
    service: item.services.map((s) => s.serviceName).join(', '),
    date: formatDate(item.appointmentDate),
    rating: review.overallRating ?? review.rating,
    stylist: item.staff ? `${item.staff.firstName} ${item.staff.lastName}`.trim() : 'Unassigned',
    text: review.comment ?? '',
  }
}

function MyReviews() {
  const navigate = useNavigate()
  const { user, restoring } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const [filter, setFilter] = useState('all')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    fetchMyAppointments({ page: 1, limit: 100 }).then(
      (data) => {
        if (stale) return
        setReviews((data?.appointments ?? []).filter((item) => item.review).map(toMyReview))
        setLoading(false)
      },
      () => {
        if (stale) return
        // Keep rows already on screen; the outage banner explains staleness.
        setLoading(false)
      },
    )
    return () => {
      stale = true
    }
  }, [recoveryTick])

  const visibleReviews = useMemo(() => {
    if (filter === 'all') return reviews
    return reviews.filter((r) => r.rating === Number(filter))
  }, [filter, reviews])

  // While the session is still being restored, keep the skeleton in place —
  // bouncing to /services here would lose the requested page.
  if (restoring) {
    return (
      <main className="min-h-[calc(100vh-76px)] bg-black py-16">
        <div className="mx-auto w-[min(100%-48px,1180px)] max-[680px]:w-[min(100%-36px,1180px)]">
          <div className="grid grid-cols-3 gap-6 max-[900px]:grid-cols-2 max-[680px]:grid-cols-1">
            {[0, 1, 2].map((row) => (
              <div className="h-[220px] animate-pulse rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e]" key={row} />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (!user) return <Navigate to="/services" replace />

  return (
    <main className="min-h-[calc(100vh-76px)] bg-black py-16">
      <div className="mx-auto w-[min(100%-48px,1180px)] max-[680px]:w-[min(100%-36px,1180px)]">
        <div className="text-center">
          <p className="m-0 text-[10px] font-semibold tracking-[0.32em] text-(--gold) uppercase">
            Your account
          </p>
          <h1 className="mt-3 mb-0 font-(--serif) text-[clamp(48px,6vw,84px)] leading-none font-light text-[#f4f1eb]">
            My reviews
          </h1>
          <p className="mt-4 font-(--serif) text-base italic text-[#c2beb6]">
            Revisit the moments that made you feel your best.
          </p>
        </div>

        <section className="mt-16" aria-label="Your shared experiences">
          <div className="mb-8 flex items-center justify-center gap-2">
            <label className="text-[13px] tracking-[0.12em] text-[#918c82] uppercase" htmlFor="review-filter">
              Filter by rating
            </label>
            <select
              className="rounded-full border border-[rgba(212,180,92,0.4)] bg-[#11100e] px-4 py-2 text-[13px] text-[#f4f1eb] outline-none focus:border-(--gold)"
              id="review-filter"
              onChange={(event) => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">All</option>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>{rating} stars</option>
              ))}
            </select>
          </div>

          {loading && (
            <div className="grid grid-cols-3 gap-6 max-[900px]:grid-cols-2 max-[680px]:grid-cols-1">
              {[0, 1, 2].map((row) => (
                <div className="h-[220px] animate-pulse rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e]" key={row} />
              ))}
            </div>
          )}

          {!loading && visibleReviews.length === 0 && (
            <EmptyState
              actionLabel="Book an appointment"
              image="/images/empty-states/empty-reviews.svg"
              message={reviews.length === 0
                ? 'Reviews you leave after your visits will appear here.'
                : 'No reviews match this rating filter.'}
              onAction={() => navigate('/services')}
              title={reviews.length === 0 ? 'No reviews yet' : 'Nothing matches'}
            />
          )}

          {!loading && visibleReviews.length > 0 && (
            <div className="grid grid-cols-3 gap-6 max-[900px]:grid-cols-2 max-[680px]:grid-cols-1">
              {visibleReviews.map((review) => (
                <article className="flex flex-col gap-3 rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e] p-6" key={review.id}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="m-0 font-(--serif) text-xl text-[#f4f1eb]">{review.service}</h2>
                    <Stars value={review.rating} />
                  </div>
                  <p className="m-0 text-[12px] tracking-[0.12em] text-[#918c82] uppercase">
                    {review.date} · with {review.stylist}
                  </p>
                  {review.text && (
                    <p className="m-0 text-[14px] leading-[1.7] text-[#c2beb6]">{review.text}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default MyReviews
