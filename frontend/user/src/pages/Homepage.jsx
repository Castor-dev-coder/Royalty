import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ClientsGallery from '../components/ClientsGallery.jsx'
import EmptyState from '../components/EmptyState.jsx'
import OurStory from '../components/OurStory.jsx'
import ReviewsCarousel from '../components/ReviewsCarousel.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import Reveal from '../components/Reveal.jsx'
import SafeImage from '../components/SafeImage.jsx'
import WaveDivider from '../components/WaveDivider.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { fetchReviewList, fetchServices } from '../lib/api.js'
import { categoryImage } from '../lib/categoryImage.js'

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

// A live, inhabited detail (the "face to face" reference keeps a personal,
// live touch on the page). Real browser time — nothing fabricated.
function StudioClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-1.5 rounded-full bg-[var(--gold)]" aria-hidden="true" />
      Studio time · {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

// GET /reviews rows -> ReviewCard props. The API carries no reviewer identity,
// so cards show a neutral label instead of a fabricated name (and photo alt
// text falls back to `a customer`).
function toCardReview(row) {
  return {
    id: row.id,
    name: 'Verified customer',
    date: formatReviewDate(row.createdAt),
    rating: row.overallRating ?? row.rating,
    category: row.appointment?.services?.[0]?.serviceName ?? '',
    text: row.comment ?? '',
    photos: row.photos ?? [],
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
    () => (user ? navigate('/services') : openAuth('login', 'book your appointment')),
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
        {/* soft gold spotlight behind the display type (depth) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-8%] top-[4%] h-[640px] w-[640px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(201,164,92,0.16), transparent 64%)',
            filter: 'blur(8px)',
          }}
        />
        <div className="absolute inset-y-0 right-0 w-[min(49%,700px)] overflow-hidden max-[900px]:w-[78%] max-[680px]:inset-0 max-[680px]:w-full after:absolute after:inset-0 after:bg-[linear-gradient(90deg,#090909_0%,rgba(9,9,9,0.88)_10%,rgba(9,9,9,0.05)_72%),linear-gradient(0deg,rgba(9,9,9,0.75),transparent_34%,rgba(9,9,9,0.18))] after:content-[''] max-[680px]:after:bg-[linear-gradient(0deg,#090909_0%,rgba(9,9,9,0.9)_10%,rgba(9,9,9,0.2)_76%),linear-gradient(90deg,rgba(9,9,9,0.65),transparent)]">
          <SafeImage className="block size-full object-cover object-[100%_40%] opacity-[0.78] max-[680px]:object-[62%_center]" src={HERO_IMAGE} alt="" />
        </div>
        <div className="relative z-[1] mx-auto flex min-h-[inherit] w-[min(100%-48px,1180px)] items-center justify-between py-[70px] max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:min-h-[610px] max-[680px]:items-end max-[680px]:py-[50px]">
          <Reveal as="div" className="max-w-[600px]">
            <span className="type-hero-eyebrow text-[var(--gold)]">
              HAIR · NAILS · BEAUTY
            </span>
            <h1 className="m-0">
              <span
                className="type-hero-title my-5 mb-[8px] block w-max"
                style={{
                  fontSize: 'clamp(56px, 9.6vw, 132px)',
                  backgroundImage:
                    'linear-gradient(120deg,#f7e6b0 0%,#eccb84 40%,#e0bd72 72%,#cda863 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                ROYALTY
              </span>
              <span
                className="type-hero-script mt-12 block w-max leading-[1.2]"
                style={{
                  fontSize: 'clamp(40px, 6vw, 84px)',
                  color: '#d6b572',
                }}
              >
                Salon
              </span>
            </h1>
            <p className="type-hero-body my-[26px] mb-[28px] max-w-[445px] text-[#ddd9d1] max-[680px]:max-w-[430px]">
              We bring out the best version of you — with precision cuts,
              considered colour, and nails finished with care. Premium hair
              and beauty, made personal.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                className="btn-pill type-hero-button inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border border-[#c9a45c] px-[1.4rem] py-[0.8rem] text-[#141008] shadow-[0_12px_34px_-12px_rgba(201,164,92,0.65)] transition-transform duration-200 hover:-translate-y-0.5"
                onClick={handleBook}
                style={{ background: 'linear-gradient(180deg,#eccb84,#c9a45c)' }}
                type="button"
              >
                BOOK YOUR APPOINTMENT
              </button>
            </div>
            <div className="type-hero-eyebrow mt-[22px] text-[var(--muted)]">
              <StudioClock />
            </div>
          </Reveal>
          <div className="absolute top-[18%] right-[10%] h-[clamp(120px,18vw,230px)] w-[clamp(120px,18vw,230px)] rounded-full opacity-[0.5] blur-[2px] max-[680px]:hidden" style={{ background: 'radial-gradient(circle, rgba(201,164,92,0.28), transparent 68%)' }} aria-hidden="true" />
        </div>
      </section>

      <WaveDivider />

      <section className="bg-[#0d0d0d] py-[106px] max-[680px]:py-[78px]" id="services">
        <div className="mx-auto w-[min(100%-48px,1180px)] max-[600px]:w-[min(100%-36px,1180px)]">
          <Reveal as="header" className="mx-auto mb-12 text-center max-[680px]:mb-[35px]">
            <div className="mb-4 text-[13px] font-medium tracking-[0.22em] text-[var(--muted)] opacity-75">
              001.
            </div>
            <span className="type-section-eyebrow text-[var(--gold)]">
              WHAT WE DO
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              Our craft, considered
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
            <p className="type-section-intro text-[var(--muted)]">
              From head to toe, we&apos;ve got you covered
            </p>
          </Reveal>
          <Reveal className="grid grid-cols-3 gap-[22px] max-[900px]:grid-cols-2 max-[680px]:grid-cols-1 max-[680px]:gap-[17px]">
            {servicesStatus === 'loading' &&
              [0, 1, 2].map((row) => (
                <div className="h-[380px] animate-pulse rounded-[16px] border border-[rgba(212,180,92,0.35)] bg-[var(--card)]" key={row} />
              ))}
            {servicesStatus === 'ready' &&
              services.map((service) => (
                <ServiceCard
                  description={service.description ?? ''}
                  duration={`${service.durationMinutes} MIN`}
                  image={categoryImage(service.categoryName)}
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
          </Reveal>
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
          <Reveal as="header" className="mx-auto mb-[38px] text-center max-[680px]:mb-[35px]">
            <div className="mb-4 text-[13px] font-medium tracking-[0.22em] text-[var(--muted)] opacity-75">
              002.
            </div>
            <span className="type-section-eyebrow text-[var(--gold)]">
              IN THEIR WORDS
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              What our clients say
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
          </Reveal>
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
          <Reveal as="header" className="mx-auto mb-[38px] text-center max-[680px]:mb-[35px]">
            <div className="mb-4 text-[13px] font-medium tracking-[0.22em] text-[var(--muted)] opacity-75">
              003.
            </div>
            <span className="type-section-eyebrow text-[var(--gold)]">
              OUR WORK
            </span>
            <h2 className="type-section-heading mt-3 italic text-[#f6f2ea]">
              Real clients, real results
            </h2>
            <div className="mx-auto my-[18px] h-0.5 w-12 bg-[var(--gold)] max-[680px]:my-4" />
          </Reveal>
        </div>
        {/* Gallery marquee rows bleed past the content container to the
            section edges, so the component sits outside it. */}
        <ClientsGallery />
      </section>

      <WaveDivider />

      <OurStory image={STORY_IMAGE} />
    </main>
  )
}

export default Homepage
