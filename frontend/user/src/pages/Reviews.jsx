import { useCallback, useMemo, useState } from 'react'
import { categories, ratingSummary, reviews as reviewData } from '../data/reviews.js'
import CategoryFilter from '../components/CategoryFilter.jsx'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import RatingSummary from '../components/RatingSummary.jsx'
import ReviewCard from '../components/ReviewCard.jsx'
import SearchBar from '../components/SearchBar.jsx'
import Signin from '../components/Signin.jsx'

function Reviews() {
  const [authView, setAuthView] = useState(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Reviews')

  const openLogin = useCallback(() => setAuthView('login'), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])

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

  return (
    <>
      <Navbar onLoginClick={openLogin} />
      <main className="min-h-[calc(100vh-76px)] bg-black">
        <h1 className="sr-only">Reviews</h1>
        <section
          aria-label="Customer reviews and ratings"
          className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[30px] max-[680px]:pb-[58px]"
          id="reviews"
        >
          <div className="mx-auto max-w-[560px]">
            <SearchBar onChange={setQuery} placeholder="Search reviews..." value={query} />
          </div>

          <div
            aria-label="Filter reviews by category"
            className="mx-auto my-[18px] mb-[42px] max-[680px]:mb-[30px]"
          >
            <CategoryFilter
              activeCategory={activeCategory}
              categories={categories}
              onSelect={setActiveCategory}
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
            </div>
          </div>

          <div className="mt-[26px] grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {filteredReviews.length > 0 ? (
              filteredReviews.map((review) => (
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
              ))
            ) : (
              <div className="rounded-[18px] border border-[var(--line)] bg-[var(--review-panel)] px-[18px] py-[26px] text-center text-[var(--muted)] md:col-span-2 xl:col-span-3">
                No reviews match your search.
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer onLoginClick={openLogin} />
      {authView === 'login' && (
        <Login onClose={closeAuth} onSwitch={switchAuth} />
      )}
      {authView === 'signin' && (
        <Signin onClose={closeAuth} onSwitch={switchAuth} />
      )}
    </>
  )
}

export default Reviews