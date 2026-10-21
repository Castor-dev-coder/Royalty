import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import Navbar from '../components/Navbar.jsx'

const myReviews = [
  {
    id: 'r1',
    service: 'Radiance Facial',
    date: 'Aug 24, 2026',
    rating: 5,
    stylist: 'Elena',
    text: 'My skin has never felt this good. The room was calm and the whole visit felt genuinely luxurious.',
  },
  {
    id: 'r2',
    service: 'Dimensional Color',
    date: 'June 12, 2026',
    rating: 5,
    stylist: 'Sophia',
    text: 'Sophia found the perfect tone for me and explained every step. The color still looks beautifully rich.',
  },
  {
    id: 'r3',
    service: 'Gel Manicure',
    date: 'Apr 03, 2026',
    rating: 5,
    stylist: 'Maya',
    text: 'Maya was detail-oriented and kind. The shape lasted weeks without a single chip.',
  },
]

function getSavedReviews() {
  try {
    return JSON.parse(localStorage.getItem('royalty-reviews') || '[]')
  } catch {
    return []
  }
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

function MyReviews() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('royalty-user'))
    } catch {
      return null
    }
  })
  const [filter, setFilter] = useState('all')
  const [reviews, setReviews] = useState(() => [...myReviews, ...getSavedReviews()])
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ title: '', text: '' })

  const logout = useCallback(() => {
    localStorage.removeItem('royalty-user')
    setUser(null)
  }, [])

  const visibleReviews = useMemo(() => {
    if (filter === 'all') return reviews
    return reviews.filter((r) => r.rating === Number(filter))
  }, [filter, reviews])

  function startEdit(review) {
    setEditingId(review.id)
    setDraft({ title: review.service, text: review.text })
  }

  function saveEdit(id) {
    setReviews((current) => current.map((review) => (
      review.id === id
        ? { ...review, service: draft.title.trim() || review.service, text: draft.text.trim() || review.text }
        : review
    )))
    const savedReviews = getSavedReviews().map((review) => (
      review.id === id
        ? { ...review, service: draft.title.trim() || review.service, text: draft.text.trim() || review.text }
        : review
    ))
    localStorage.setItem('royalty-reviews', JSON.stringify(savedReviews))
    setEditingId(null)
    setDraft({ title: '', text: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft({ title: '', text: '' })
  }

  function deleteReview(id) {
    setReviews((current) => current.filter((r) => r.id !== id))
    localStorage.setItem('royalty-reviews', JSON.stringify(getSavedReviews().filter((review) => review.id !== id)))
  }

  if (!user) return <Navigate to="/services" replace />

  return (
    <>
      <Navbar user={user} onLogout={logout} onLoginClick={() => navigate('/services')} />
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
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="m-0 text-[10px] font-semibold tracking-[0.32em] text-(--gold) uppercase">
                  Shared by you
                </p>
                <h2 className="mt-2 mb-0 font-(--serif) text-[clamp(28px,3.4vw,40px)] leading-tight font-light text-[#f4f1eb]">
                  Your experiences
                </h2>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-[rgba(212,180,92,0.18)] py-4">
              <div className="flex items-center gap-3" role="tablist" aria-label="Filter reviews by rating">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'all'}
                  onClick={() => setFilter('all')}
                  className={`cursor-pointer rounded-full border px-5 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors ${
                    filter === 'all'
                      ? 'border-(--gold) bg-(--gold) text-[#111111]'
                      : 'border-[rgba(212,180,92,0.35)] bg-transparent text-[#c2beb6] hover:border-(--gold) hover:text-(--gold)'
                  }`}
                >
                  All reviews
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === '5'}
                  onClick={() => setFilter('5')}
                  className={`cursor-pointer rounded-full border px-5 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors ${
                    filter === '5'
                      ? 'border-(--gold) bg-(--gold) text-[#111111]'
                      : 'border-[rgba(212,180,92,0.35)] bg-transparent text-[#c2beb6] hover:border-(--gold) hover:text-(--gold)'
                  }`}
                >
                  5 stars
                </button>
              </div>
              <p className="m-0 text-[10px] tracking-[0.32em] text-(--gold) uppercase">
                {visibleReviews.length} experiences
              </p>
            </div>

            <div className="mt-8 grid gap-6">
              {visibleReviews.length === 0 && (
                <div className="rounded-md border border-[rgba(212,180,92,0.22)] bg-[#11100e] px-6 py-12 text-center text-sm text-[#918c82]">
                  No reviews yet. Share your first experience to see it here.
                </div>
              )}

              {visibleReviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-md border border-[rgba(212,180,92,0.55)] bg-[#11100e] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:p-8"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="m-0 font-(--serif) text-2xl font-light italic text-[#f4f1eb]">
                        {review.service}
                      </h3>
                      <p className="mt-1 text-[10px] font-semibold tracking-[0.28em] text-[#918c82] uppercase">
                        {review.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <Stars value={review.rating} />
                      <p className="mt-1 text-[10px] tracking-[0.18em] text-[#918c82] uppercase">
                        with {review.stylist}
                      </p>
                    </div>
                  </div>

                  {editingId === review.id ? (
                    <div className="mt-5">
                      <label
                        htmlFor={`edit-title-${review.id}`}
                        className="sr-only"
                      >
                        Edit review title for {review.service}
                      </label>
                      <input
                        id={`edit-title-${review.id}`}
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
                        className="mb-3 w-full border-0 bg-transparent p-0 font-(--serif) text-2xl font-light italic text-[#f4f1eb] outline-none"
                      />
                      <label
                        htmlFor={`edit-${review.id}`}
                        className="sr-only"
                      >
                        Edit review for {review.service}
                      </label>
                      <textarea
                        id={`edit-${review.id}`}
                        rows={4}
                        value={draft.text}
                        onChange={(e) => setDraft((current) => ({ ...current, text: e.target.value }))}
                        className="w-full resize-y rounded-md border border-[rgba(212,180,92,0.35)] bg-[#0d0d0c] px-4 py-3 text-sm leading-relaxed text-[#f4f1eb] outline-none transition-colors focus:border-(--gold)"
                      />
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => saveEdit(review.id)}
                          className="cursor-pointer rounded-sm border border-(--gold) bg-(--gold) px-4 py-2 text-[10px] font-bold tracking-[0.2em] text-[#111] uppercase transition-colors hover:bg-(--gold-bright)"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="cursor-pointer rounded-sm border border-[rgba(212,180,92,0.35)] bg-transparent px-4 py-2 text-[10px] font-semibold tracking-[0.2em] text-[#918c82] uppercase transition-colors hover:border-[rgba(212,180,92,0.6)] hover:text-[#f4f1eb]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-5 text-sm leading-relaxed text-[#e7e1d5]">
                      {review.text}
                    </p>
                  )}

                  {editingId !== review.id && (
                    <div className="mt-6 flex items-center gap-6 border-t border-[rgba(212,180,92,0.15)] pt-4">
                      <button
                        type="button"
                        onClick={() => startEdit(review)}
                        className="cursor-pointer text-[10px] font-semibold tracking-[0.28em] text-(--gold) uppercase transition-opacity hover:opacity-80"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReview(review.id)}
                        className="cursor-pointer text-[10px] font-semibold tracking-[0.28em] text-[#918c82] uppercase transition-colors hover:text-[#f4f1eb]"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer user={user} onLoginClick={() => navigate('/services')} />
    </>
  )
}

export default MyReviews