import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CategoryFilter from '../components/CategoryFilter.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import RatingSummary from '../components/RatingSummary.jsx'
import ReviewCard from '../components/ReviewCard.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { categories, ratingSummary, reviews as reviewData } from '../data/reviews.js'

const PAGE_SIZE = 3

function Reviews() {
  const navigate = useNavigate()
  const { user, openAuth } = useAuth()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Reviews')
  const [page, setPage] = useState(1)

  const filteredReviews = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return reviewData.filter((review) => {
      const matchesCategory =
        activeCategory === 'All Reviews' || review.category === activeCategory
      const matchesQuery =
        !normalizedQuery ||
        `${review.name} ${review.text}`.toLowerCase().includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })
  }, [activeCategory, query])

  const pageCount = Math.max(1, Math.ceil(filteredReviews.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleReviews = filteredReviews.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const clearFilters = useCallback(() => {
    setQuery('')
    setActiveCategory('All Reviews')
  }, [])

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
        <div className="mx-auto max-w-[560px]">
          <SearchBar
            onChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
            placeholder="Search reviews..."
            value={query}
          />
        </div>

        <div
          aria-label="Filter reviews by category"
          className="mx-auto my-[18px] mb-[42px] max-[680px]:mb-[30px]"
        >
          <CategoryFilter
            activeCategory={activeCategory}
            categories={categories}
            onSelect={(category) => {
              setActiveCategory(category)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-[16px] md:grid-cols-[1.2fr_0.8fr]">
          <RatingSummary
            average={ratingSummary.average}
            breakdown={ratingSummary.breakdown}
            totalReviews={ratingSummary.totalReviews}
          />

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

        {filteredReviews.length > 0 ? (
          <>
            <p aria-live="polite" className="m-0 mt-[26px] text-[13px] tracking-[0.14em] text-(--muted) uppercase">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredReviews.length)} of{' '}
              {filteredReviews.length} reviews
            </p>
            <div className="mt-[14px] grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
              {visibleReviews.map((review) => (
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
              onChange={setPage}
              page={safePage}
              pageCount={pageCount}
              totalItems={filteredReviews.length}
            />
          </>
        ) : (
          <div className="mt-[26px]">
            <EmptyState
              actionLabel="Clear search"
              image="/images/empty-states/empty-search.svg"
              message="Try a different keyword or browse all client reviews."
              onAction={clearFilters}
              title="No reviews match your search"
            />
          </div>
        )}
      </section>
    </main>
  )
}

export default Reviews
