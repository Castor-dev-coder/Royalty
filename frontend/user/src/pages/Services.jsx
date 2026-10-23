import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BookingFlow from '../components/BookingFlow.jsx'
import CategoryFilter from '../components/CategoryFilter.jsx'
import EmptyState from '../components/EmptyState.jsx'
import SearchBar from '../components/SearchBar.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import { useAuth } from '../context/useAuth.jsx'
import services from '../data/services.js'
import { getNextAppointment, formatAppointmentDate } from '../utils/appointments.js'

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
  // Services is publicly browsable. Open authentication only after an explicit
  // protected action, such as booking or managing an appointment.
  const { user, openAuth } = useAuth()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Services')
  const [bookingService, setBookingService] = useState(null)

  const handleBook = useCallback(
    (service) => {
      if (!user) {
        openAuth('login')
        return
      }
      setBookingService(service)
    },
    [openAuth, user],
  )

  const clearFilters = useCallback(() => {
    setQuery('')
    setActiveCategory('All Services')
  }, [])

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
    <main className="min-h-[calc(100vh-76px)] bg-black" id="home">
      <h1 className="sr-only">Salon Services</h1>
      <section
        aria-label="Browse salon services"
        className="mx-auto w-[min(100%-48px,1180px)] py-[34px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[22px] max-[680px]:pb-[58px]"
        id="services"
      >
        {user && (() => {
          const nextAppointment = getNextAppointment(user)
          return (
            <section aria-label="Welcome and next appointment" className="welcome-panel mb-[36px] flex min-h-[96px] items-center gap-7 px-[26px] py-[18px] max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-4 max-[680px]:mb-7 max-[680px]:px-4">
              <div className="flex shrink-0 items-center gap-3.5">
                <div className="welcome-gold grid size-[46px] shrink-0 place-items-center rounded-full border border-current" aria-hidden="true">
                  <svg className="size-[21px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.35]" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.5 2.8-5.3 6.5-5.3s5.8 1.8 6.5 5.3" />
                  </svg>
                </div>
                <div>
                  <p className="welcome-gold m-0 font-[var(--serif)] text-[22px] leading-tight">Welcome, {user?.name || 'Maria'}</p>
                  <p className="m-0 mt-1 text-[13px] text-(--muted)">Your beauty journey continues</p>
                </div>
              </div>
              <div aria-hidden="true" className="h-12 w-px shrink-0 bg-[rgba(212,180,92,0.4)] max-[760px]:h-px max-[760px]:w-full" />
              <div className="flex min-w-0 flex-1 items-center gap-5 max-[760px]:flex-wrap">
                <div className="welcome-gold grid size-[38px] shrink-0 place-items-center rounded-full border border-current" aria-hidden="true">
                  <svg className="size-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.35]" viewBox="0 0 24 24">
                    <rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M4 10h16" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 basis-[240px]">
                  <p className="welcome-gold m-0 text-[13px] font-semibold uppercase tracking-[1px]">Your next appointment</p>
                  <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-(--text)">
                    {nextAppointment
                      ? <>{nextAppointment.service} <span className="mx-1 text-(--muted)">•</span> {formatAppointmentDate(nextAppointment.date)} <span className="mx-1 text-(--muted)">•</span> {nextAppointment.time}</>
                      : 'No upcoming appointments yet.'}
                  </p>
                </div>
                <button type="button" onClick={() => navigate('/appointments')} className="btn-pill ml-auto min-h-[44px] shrink-0 rounded-full border border-[var(--gold)] bg-[var(--gold)] px-6 text-[13px] font-bold uppercase text-[#15120b] hover:bg-[var(--gold-bright)] max-[760px]:ml-0 max-[760px]:w-full">Manage appointment</button>
              </div>
            </section>
          )
        })()}

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
          className="grid grid-cols-3 gap-[22px] max-[900px]:grid-cols-2 max-[680px]:grid-cols-2 max-[680px]:gap-3 max-[420px]:gap-2.5"
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
            <div className="col-span-full">
              <EmptyState
                actionLabel="Clear search"
                image="/images/empty-states/empty-search.svg"
                message="Try a different keyword or browse all of our services."
                onAction={clearFilters}
                title="No services match your search"
              />
            </div>
          )}
        </div>
      </section>
      {bookingService && (
        <BookingFlow
          onClose={() => setBookingService(null)}
          service={bookingService}
          user={user}
        />
      )}
    </main>
  )
}

export default Services
