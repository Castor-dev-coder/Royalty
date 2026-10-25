import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'
import OurStory from '../components/OurStory.jsx'
import ReviewsCarousel from '../components/ReviewsCarousel.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import SafeImage from '../components/SafeImage.jsx'
import WaveDivider from '../components/WaveDivider.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { fetchReviewList, fetchServices } from '../lib/api.js'

// Brand assets (not data) — they live in /public/images.
const HERO_IMAGE = '/images/hero.jpg'
const STORY_IMAGE = '/images/stylist-curling-hair.jpg'

function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
}

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
    date: formatReviewDate(row.createdAt),
    rating: row.overallRating ?? row.rating,
    category: row.appointment?.services?.[0]?.serviceName ?? '',
    text: row.comment ?? '',
  }
}

function Homepage() {
  const { user, openAuth } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const navigate = useNavigate()
  const [services, setServices] = useState([])
  const [servicesStatus, setServicesStatus] = useState('loading') // loading | ready | empty
  const [reviews, setReviews] = useState([])

  // Booking requires a signed-in customer: signed-out visitors get the login
  // dialog (the app's established behavior), signed-in ones go straight to the
  // services catalogue where booking actually works.
  const handleBook = useCallback(
    () => (user ? navigate('/services') : openAuth('login')),
    [navigate, openAuth, user],
  )

  useEffect(() => {
    let stale = false
    // The catalogue is public (anonymous GET /services returns data), so
    // signed-out visitors browse it too; only booking requires an account.
    fetchServices().then(
      (data) => {
        if (stale) return
        const rows = data?.services ?? []
        setServices(rows.slice(0, 6))
        setServicesStatus(rows.length > 0 ? 'ready' : 'empty')
      },
      () => {
        if (stale) return
        // Keep whatever is already on screen — the outage banner explains
        // staleness; only a page with nothing to show gets an empty state.
        setServicesStatus((current) => (current === 'ready' ? 'ready' : 'empty'))
      },
    )
    return () => {
      stale = true
    }
  }, [recoveryTick])

  useEffect(() => {
    let stale = false
    fetchReviewList({ page: 1, limit: 6 }).then(
      (data) => {
        if (stale) return
        setReviews((data?.reviews ?? []).map(toCardReview))
      },
      () => {
        // ReviewsCarousel renders its own empty state.
      },
    )
    return () => {
      stale = true
    }
  }, [recoveryTick])

  return (
    <main>
      <section
        className="home-hero relative flex min-h-[min(690px,calc(100svh-76px))] items-center overflow-hidden bg-[#090909] max-[900px]:min-h-[610px] max-[680px]:min-h-[630px] max-[680px]:items-end"
        id="home"
      >
        <div className="absolute inset-y-0 right-0 w-[min(70%,920px)] overflow-hidden max-[900px]:w-[78%] max-[680px]:inset-0 max-[680px]:w-full after:absolute after:inset-0 after:bg-[linear-gradient(90deg,#090909_0%,rgba(9,9,9,0.88)_10%,rgba(9,9,9,0.05)_72%),linear-gradient(0deg,rgba(9,9,9,0.75),transparent_34%,rgba(9,9,9,0.18))] after:content-[''] max-[680px]:after:bg-[linear-gradient(0deg,#090909_0%,rgba(9,9,9,0.9)_10%,rgba(9,9,9,0.2)_76%),linear-gradient(90deg,rgba(9,9,9,0.65),transparent)]">
          <SafeImage className="block size-full object-cover object-[center_40%] opacity-[0.78] max-[680px]:object-[62%_center]" src={HERO_IMAGE} alt="" />
        </div>
        <div className="relative z-[1] mx-auto flex min-h-[inherit] w-[min(100%-48px,1180px)] items-center justify-between py-[70px] max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:min-h-[610px] max-[680px]:items-end max-[680px]:py-[50px]">
          <div className="max-w-[550px]">
            <span className="type-hero-eyebrow text-[var(--gold)]">
              HAIR · NAILS · BEAUTY
            </span>
            <h1 className="m-0">
              <span className="type-hero-title my-5 mb-[23px] block text-[var(--gold)]">
                ROYALTY
              </span>
              <span className="type-hero-script my-5 mb-[23px] block text-[var(--gold)]">
                Salon
              </span>
            </h1>
            <p className="type-hero-body my-[29px] mb-[30px] max-w-[445px] text-[#ddd9d1] max-[680px]:max-w-[430px]">
              At Royalty Salon, we bring out the best version of you with
              premium hair, nail, and beauty services. Your beauty, our
              priority.
            </p>
            <button className="btn-pill type-hero-button inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] hover:bg-[var(--gold-bright)]" onClick={handleBook} type="button">
              BOOK YOUR APPOINTMENT
            </button>
          </div>
          <div className="absolute top-[16%] right-[9%] w-[clamp(45px,6vw,80px)] text-[var(--gold)] opacity-[0.82] max-[900px]:right-[5%] max-[680px]:top-[11%] max-[680px]:right-[6%] max-[680px]:w-[50px]" aria-hidden="true">
            <svg viewBox="0 0 100 78" fill="none">
              <path
                d="m10 23 19 17 20-30 21 30 20-17-8 43H18L10 23Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M18 55h64M26 67h48" stroke="currentColor" strokeWidth="2" />
              <circle cx="10" cy="20" r="4" fill="currentColor" />
              <circle cx="49" cy="8" r="4" fill="currentColor" />
              <circle cx="90" cy="20" r="4" fill="currentColor" />
            </svg>
          </div>
        </div>
      </section>

      <WaveDivider />

      <section className="bg-[#0d0d0d] py-[106px] max-[680px]:py-[78px]" id="services">
        <div className="mx-auto w-[min(100%-48px,1180px)] max-[600px]:w-[min(100%-36px,1180px)]">
          <header className="mx-auto mb-12 text-center max-[680px]:mb-[35px]">
            <span className="type-section-eyebrow text-[var(--gold)]">
              OUR SERVICES
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              Services We Offer
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
            <p className="type-section-intro text-[var(--muted)]">
              From head to toe, we&apos;ve got you covered
            </p>
          </header>
          <div className="grid grid-cols-3 gap-[22px] max-[900px]:grid-cols-2 max-[680px]:grid-cols-1 max-[680px]:gap-[17px]">
            {servicesStatus === 'loading' &&
              [0, 1, 2].map((row) => (
                <div className="h-[380px] animate-pulse rounded-[16px] border border-[rgba(212,180,92,0.35)] bg-[var(--card)]" key={row} />
              ))}
            {servicesStatus === 'ready' &&
              services.map((service) => (
                <ServiceCard
                  description={service.description ?? ''}
                  duration={`${service.durationMinutes} MIN`}
                  image={undefined}
                  key={service.id}
                  onBook={handleBook}
                  price={formatPeso(service.price)}
                  title={service.name}
                />
              ))}
            {servicesStatus === 'empty' && (
              <div className="col-span-full">
                <EmptyState
                  image="/images/empty-states/empty-search.svg"
                  message="Our services will appear here once they are published."
                  title="No services yet"
                />
              </div>
            )}
          </div>
          <div className="mt-[42px] flex justify-center">
            <Link className="btn-pill type-section-button inline-flex min-h-[46px] items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] no-underline hover:bg-[var(--gold-bright)]" to="/services">
              View All Services
            </Link>
          </div>
        </div>
      </section>

      <WaveDivider />

      <section className="salon-atmosphere bg-[#080808] py-[106px] max-[680px]:py-[78px]" id="reviews">
        <div aria-hidden="true" className="salon-lines" />
        <div className="mx-auto w-[min(100%-48px,1180px)] max-[600px]:w-[min(100%-36px,1180px)]">
          <header className="mx-auto mb-[38px] text-center max-[680px]:mb-[35px]">
            <span className="type-section-eyebrow text-[var(--gold)]">
              WHAT CLIENTS SAY
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              Loved by Our Clients
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
          </header>
          <ReviewsCarousel reviews={reviews} />
          <div className="mt-[38px] flex justify-center">
            <Link className="btn-pill type-section-button inline-flex min-h-[46px] items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] no-underline hover:bg-[var(--gold-bright)]" to="/reviews">
              View More Reviews
            </Link>
          </div>
        </div>
      </section>

      <WaveDivider />

      <section className="salon-atmosphere bg-[#080808] pb-[106px] max-[680px]:pb-[78px]" id="gallery">
        <div aria-hidden="true" className="salon-lines" />
        <div className="mx-auto w-[min(100%-48px,1180px)] max-[600px]:w-[min(100%-36px,1180px)]">
          <header className="mx-auto mb-[38px] text-center max-[680px]:mb-[35px]">
            <span className="type-section-eyebrow text-[var(--gold)]">
              CLIENTS GALLERY
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              Our Customers
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
          </header>
          {/* No gallery endpoint exists yet — empty state instead of stock photos. */}
          <EmptyState
            image="/images/empty-states/empty-search.svg"
            message="Client photos will appear here once the gallery is connected."
            title="Gallery coming soon"
          />
        </div>
      </section>

      <WaveDivider />

      <OurStory image={STORY_IMAGE} />
    </main>
  )
}

export default Homepage
