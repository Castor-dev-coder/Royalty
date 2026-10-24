import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import ReviewCard from '../components/ReviewCard.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { fetchReviewList } from '../lib/api.js'

const PAGE_SIZE = 3

function formatReviewDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// GET /reviews rows -> ReviewCard props. The API carries no reviewer identity,
// so cards show a neutral label instead of a fabricated name.
function toCardReview(row) {
  return {
    id: row.id,
    name: 'Verified customer',
    avatar: undefined,
    date: formatReviewDate(row.createdAt),
    rating: row.overallRating ?? row.rating,
    category: row.appointment?.services?.[0]?.serviceName ?? '',
    text: row.comment ?? '',
  }
}

function Reviews() {
  const navigate = useNavigate()
  const { user, openAuth } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    fetchReviewList({ page, limit: PAGE_SIZE }).then(
      (data) => {
        if (stale) return
        setRows((data?.reviews ?? []).map(toCardReview))
        setTotal(data?.total ?? 0)
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
  }, [page, recoveryTick])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleShare = useCallback(() => {
    if (user) {
      navigate('/appointments')
    } else {
      openAuth('login')
    }
  }, [navigate, openAuth, user])

  return (
    <main className="min-h-[calc(100vh-76px)] bg-black">
      <h1 className="sr-only">Reviews</h1>
      <section
        aria-label="Customer reviews and ratings"
        className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[30px] max-[680px]:pb-[58px]"
        id="reviews"
      >
        <div className="grid gap-[16px] md:grid-cols-[1.2fr_0.8fr]">
          {/* No aggregate-summary endpoint exists yet (FE gap): the fabricated
              summary is gone and nothing is invented to replace it. */}
          <div className="flex flex-col items-center justify-center rounded-[18px] border border-[var(--line)] bg-[var(--review-panel)] p-[22px_20px] text-center">
            <h2 className="m-0 text-[24px] font-semibold leading-none text-[var(--gold)]">
              Rating summary
            </h2>
            <p className="mt-[12px] max-w-[320px] text-[14px] leading-[1.7] text-[#d9d3ca]" role="status">
              Not available yet. {total} verified {total === 1 ? 'review' : 'reviews'} are listed below.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center rounded-[18px] border border-[var(--line)] bg-[var(--review-panel)] p-[22px_20px] text-center">
            <h2 className="m-0 text-[24px] font-semibold leading-none text-[var(--gold)]">
              Share Your Experience
            </h2>
            <p className="mt-[12px] max-w-[320px] text-[14px] leading-[1.7] text-[#d9d3ca]">
              We&apos;d love to hear from you! Leave a review and help us serve you better.
            </p>
            <button
              className="btn-pill type-section-button mt-[18px] inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.2rem] py-[0.65rem] text-[#111] hover:bg-[var(--gold-bright)] hover:text-[#111]"
              onClick={handleShare}
              type="button"
            >
              Write a Review
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-[26px] grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((row) => (
              <div className="h-[260px] animate-pulse rounded-[18px] border border-[var(--line)] bg-[var(--review-panel)]" key={row} />
            ))}
          </div>
        ) : rows.length > 0 ? (
          <>
            <p aria-live="polite" className="m-0 mt-[26px] text-[13px] tracking-[0.14em] text-(--muted) uppercase">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total} reviews
            </p>
            <div className="mt-[14px] grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
              {rows.map((review) => (
                <ReviewCard
                  avatar={review.avatar}
                  category={review.category}
                  date={review.date}
                  images={review.images}
                  key={review.id}
                  name={review.name}
                  rating={review.rating}
                  text={review.text}
                />
              ))}
            </div>
            <Pagination
              onChange={(next) => {
                setLoading(true)
                setPage(next)
              }}
              page={page}
              pageCount={pageCount}
              totalItems={total}
            />
          </>
        ) : (
          <div className="mt-[26px]">
            <EmptyState
              image="/images/empty-states/empty-reviews.svg"
              message="Once clients share their experiences, the reviews will appear here."
              title="No reviews yet"
            />
          </div>
        )}
      </section>
    </main>
  )
}

export default Reviews
