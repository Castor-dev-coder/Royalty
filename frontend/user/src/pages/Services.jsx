import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CategoryFilter from '../components/CategoryFilter.jsx'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import SearchBar from '../components/SearchBar.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import Signin from '../components/Signin.jsx'
import BookingFlow from '../components/BookingFlow.jsx'
import services from '../data/services.js'

const categories = [
  'All Services',
  'Haircuts',
  'Hair Coloring',
  'Hair Treatment',
  'Styling',
  'Packages',
]

function Services() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('royalty-user')) } catch { return null }
  })
  // Services is publicly browsable. Open authentication only after an explicit
  // protected action, such as booking or managing an appointment.
  const [authView, setAuthView] = useState(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Services')
  const [bookingService, setBookingService] = useState(null)
  const openLogin = useCallback(() => setAuthView('login'), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])
  const handleLogin = useCallback((nextUser) => setUser(nextUser), [])
  const handleLogout = useCallback(() => {
    localStorage.removeItem('royalty-user')
    setUser(null)
    setBookingService(null)
  }, [])
  const handleBook = useCallback((service) => {
    if (!user) { setAuthView('login'); return }
    setBookingService(service)
  }, [user])

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return services.filter((service) => {
      const matchesCategory =
        activeCategory === 'All Services' ||
        service.category === activeCategory
      const matchesQuery =
        !normalizedQuery ||
        `${service.title} ${service.description} ${service.category}`
          .toLowerCase()
          .includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })
  }, [activeCategory, query])

  return (
    <>
      <Navbar onLoginClick={openLogin} onLogout={handleLogout} user={user} />
      <main className="min-h-[calc(100vh-76px)] bg-black" id="home">
        <h1 className="sr-only">Salon Services</h1>
        <section
          aria-label="Browse salon services"
          className="mx-auto w-[min(100%-48px,1180px)] py-[34px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[22px] max-[680px]:pb-[58px]"
          id="services"
        >
          {user && <div className="mb-[36px] flex min-h-[88px] items-center justify-between gap-6 rounded-[5px] border border-[rgba(212,180,92,0.72)] bg-[#11100e] px-[25px] py-[14px] shadow-[0_0_24px_rgba(212,180,92,0.04)] max-[760px]:flex-wrap max-[760px]:gap-4 max-[680px]:mb-7 max-[680px]:px-4">
            <div className="flex items-center gap-3">
              <div className="grid size-[42px] shrink-0 place-items-center rounded-full border border-[var(--gold)] text-[var(--gold)]" aria-hidden="true">
                <svg className="size-[20px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.35]" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.5 2.8-5.3 6.5-5.3s5.8 1.8 6.5 5.3" />
                </svg>
              </div>
              <div>
                <p className="m-0 font-[var(--serif)] text-[17px] text-[var(--gold)]">Welcome, {user?.name || 'Maria'}</p>
                <p className="m-0 mt-1 text-[8px] uppercase tracking-[1px] text-[#aaa49a]">Your beauty journey continues</p>
              </div>
            </div>
            <div className="hidden h-12 w-px bg-[rgba(212,180,92,0.4)] min-[761px]:block" />
            <div className="flex flex-1 items-center gap-3 min-[761px]:max-w-[430px]">
              <span className="text-[24px] text-[var(--gold)]" aria-hidden="true">▣</span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[9px] uppercase tracking-[1px] text-[var(--gold)]">Your next appointment</p>
                <p className="m-1 mb-0 truncate text-[11px] text-[#ddd8cf]">Hair Coloring <span className="mx-1 text-[#77736a]">•</span> Oct 10, 2026 <span className="mx-1 text-[#77736a]">•</span> 2:30 PM</p>
              </div>
              <button type="button" onClick={() => user ? navigate('/appointments') : openLogin()} className="shrink-0 rounded-[2px] border border-[var(--gold)] bg-[var(--gold)] px-3 py-2 text-[8px] font-bold uppercase text-[#15120b] transition-colors hover:bg-[var(--gold-bright)]">Manage appointment</button>
            </div>
          </div>}

          <div className="mx-auto max-w-[560px]">
            <SearchBar onChange={setQuery} placeholder="Search services..." value={query} />
          </div>

          <div
            aria-label="Filter services by category"
            className="mx-auto my-[18px] mb-[42px] max-[680px]:mb-[30px]"
          >
            <CategoryFilter
              activeCategory={activeCategory}
              categories={categories}
              onSelect={setActiveCategory}
            />
          </div>

          <div
            aria-live="polite"
            className="grid grid-cols-3 gap-[22px] [&>article]:flex [&>article]:flex-col [&>article>div:first-child]:h-[210px] [&>article>div:first-child]:min-h-0 [&>article>div:nth-child(2)]:min-h-[206px] max-[900px]:grid-cols-2 max-[680px]:grid-cols-1 max-[680px]:gap-[17px] max-[680px]:[&>article>div:first-child]:h-[190px]"
          >
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                description={service.description}
                duration={service.duration}
                image={service.image}
                onBook={() => handleBook(service)}
                price={service.price}
                title={service.title}
              />
            ))}
            {filteredServices.length === 0 && (
              <p className="col-span-full m-0 py-[34px] text-center text-[var(--muted)]">
                No services match your search.
              </p>
            )}
          </div>
        </section>
      </main>
      <Footer user={user} onLoginClick={openLogin} />
      {authView === 'login' && (
        <Login onClose={closeAuth} onSwitch={switchAuth} onLogin={handleLogin} />
      )}
      {authView === 'signin' && (
        <Signin onClose={closeAuth} onSwitch={switchAuth} onLogin={handleLogin} />
      )}
      {bookingService && <BookingFlow user={user} service={bookingService} onClose={() => setBookingService(null)} />}
    </>
  )
}

export default Services
