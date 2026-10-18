import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import OurStory from '../components/OurStory.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import Signin from '../components/Signin.jsx'
import { images, serviceDetails } from '../data/sample-data'

const galleryRows = [
  { id: 'hair', label: 'Hair Services', images: images.gallery.hair },
  { id: 'barber', label: 'Men’s Grooming & Barber', images: images.gallery.barber },
  { id: 'beauty', label: 'Nails & Beauty', images: images.gallery.beauty },
]

function GalleryRow({ row }) {
  const trackRef = useRef(null)
  const dragState = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setCanScrollLeft(track.scrollLeft > 2)
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined
    updateScrollState()
    track.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      track.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [updateScrollState])

  function scrollPage(direction) {
    trackRef.current?.scrollBy({
      left: direction * trackRef.current.clientWidth,
      behavior: 'smooth',
    })
  }

  function handleWheel(event) {
    const track = trackRef.current
    if (!track || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    const canMove = event.deltaY < 0 ? canScrollLeft : canScrollRight
    if (!canMove) return
    event.preventDefault()
    track.scrollLeft += event.deltaY
  }

  function handlePointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    dragState.current = { x: event.clientX, scrollLeft: trackRef.current.scrollLeft }
    trackRef.current.setPointerCapture(event.pointerId)
    trackRef.current.classList.add('snap-none', 'cursor-grabbing', 'select-none')
  }

  function handlePointerMove(event) {
    if (!dragState.current) return
    trackRef.current.scrollLeft =
      dragState.current.scrollLeft - (event.clientX - dragState.current.x)
  }

  function handlePointerUp(event) {
    if (!dragState.current) return
    dragState.current = null
    if (trackRef.current.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId)
    }
    trackRef.current.classList.remove('snap-none', 'cursor-grabbing', 'select-none')
  }

  const tiles = [...row.images, ...row.images]

  return (
    <div>
      <div className="mb-[14px] flex items-center justify-between gap-5">
        <h3 className="type-gallery-heading m-0 text-[#ded9cf]">
          {row.label}
        </h3>
        <div className="flex gap-2">
          <button
            aria-label={`Scroll ${row.label} left`}
            className="grid size-[34px] cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-transparent text-[var(--gold)] transition-[background,color,opacity] duration-[180ms] enabled:hover:bg-[var(--gold)] enabled:hover:text-[#111] disabled:cursor-default disabled:opacity-[0.28]"
            disabled={!canScrollLeft}
            onClick={() => scrollPage(-1)}
            type="button"
          >
            <svg className="w-[17px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            aria-label={`Scroll ${row.label} right`}
            className="grid size-[34px] cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-transparent text-[var(--gold)] transition-[background,color,opacity] duration-[180ms] enabled:hover:bg-[var(--gold)] enabled:hover:text-[#111] disabled:cursor-default disabled:opacity-[0.28]"
            disabled={!canScrollRight}
            onClick={() => scrollPage(1)}
            type="button"
          >
            <svg className="w-[17px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div
        aria-label={`${row.label} gallery`}
        className="flex snap-x snap-mandatory touch-pan-x gap-3 overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        ref={trackRef}
        role="region"
        tabIndex="0"
      >
        {tiles.map((image, index) => (
          <div
            className="aspect-[3/4] flex-[0_0_calc((100%-48px)/5)] snap-start cursor-grab overflow-hidden rounded-[5px] border border-[rgba(212,180,92,0.2)] bg-[linear-gradient(135deg,#29241a,#151515_55%,#2b2518)] max-[900px]:flex-[0_0_calc((100%-24px)/3)] max-[600px]:flex-[0_0_calc((100%-12px)/2)]"
            key={`${row.id}-${index}`}
          >
            <img className="pointer-events-none block size-full object-cover transition-transform duration-[320ms] hover:scale-[1.04]" src={image} alt={`${row.label} salon result ${index + 1}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Homepage() {
  const [authView, setAuthView] = useState(null)
  const openLogin = useCallback(() => setAuthView('login'), [])
  const closeAuth = useCallback(() => setAuthView(null), [])

  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])

  return (
    <>
      <Navbar onLoginClick={openLogin} />
      <main>
        <section
          className="relative flex min-h-[min(690px,calc(100svh-76px))] items-center overflow-hidden bg-[#090909] max-[900px]:min-h-[610px] max-[680px]:min-h-[630px] max-[680px]:items-end"
          id="home"
        >
          <div className="absolute inset-y-0 right-0 w-[min(70%,920px)] overflow-hidden max-[900px]:w-[78%] max-[680px]:inset-0 max-[680px]:w-full after:absolute after:inset-0 after:bg-[linear-gradient(90deg,#090909_0%,rgba(9,9,9,0.88)_10%,rgba(9,9,9,0.05)_72%),linear-gradient(0deg,rgba(9,9,9,0.75),transparent_34%,rgba(9,9,9,0.18))] after:content-[''] max-[680px]:after:bg-[linear-gradient(0deg,#090909_0%,rgba(9,9,9,0.9)_10%,rgba(9,9,9,0.2)_76%),linear-gradient(90deg,rgba(9,9,9,0.65),transparent)]">
            <img className="block size-full object-cover object-[center_40%] opacity-[0.78] max-[680px]:object-[62%_center]" src={images.hero} alt="" />
          </div>
          <div className="relative z-[1] mx-auto flex min-h-[inherit] w-[min(100%-48px,1180px)] items-center justify-between py-[70px] max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:min-h-[610px] max-[680px]:items-end max-[680px]:py-[50px]">
            <div className="max-w-[550px]">
              <span className="type-hero-eyebrow text-[var(--gold)]">
                HAIR · NAILS · BEAUTY
              </span>
              <h1 className="type-hero-title my-5 mb-[23px] text-[var(--gold)]">
                ROYALTY
              </h1>
                <h1 className="type-hero-script my-5 mb-[23px] text-[var(--gold)]">
                 Salon
                </h1>
              <p className="type-hero-body my-[29px] mb-[30px] max-w-[445px] text-[#ddd9d1] max-[680px]:max-w-[430px]">
                At Royalty Salon, we bring out the best version of you with
                premium hair, nail, and beauty services. Your beauty, our
                priority.
              </p>
              <button className="type-hero-button inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-[3px] border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--gold-bright)]" onClick={openLogin} type="button">
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
              {[...serviceDetails, ...serviceDetails].map((service, index) => (
                <ServiceCard
                  key={`${service.title}-${index}`}
                  {...service}
                  onBook={openLogin}
                />
              ))}
            </div>
            <div className="mt-[42px] flex justify-center">
              <Link className="type-section-button inline-flex min-h-[46px] items-center justify-center rounded-[3px] border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] no-underline transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--gold-bright)]" to="/services">
                View All Services
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-[#080808] py-[106px] max-[680px]:py-[78px]" id="reviews">
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
            <div className="flex flex-col gap-[35px] max-[680px]:gap-[26px]">
              {galleryRows.map((row) => (
                <GalleryRow key={row.id} row={row} />
              ))}
            </div>
            <div className="mt-[38px] flex justify-center">
              <a className="type-section-button inline-flex min-h-[46px] items-center justify-center rounded-[3px] border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] no-underline transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--gold-bright)]" href="#reviews">
                View More Reviews
              </a>
            </div>
          </div>
        </section>

        <OurStory image={images.story} />
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

export default Homepage