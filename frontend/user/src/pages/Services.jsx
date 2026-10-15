import { useCallback, useMemo, useState } from 'react'
import CategoryFilter from '../components/CategoryFilter.jsx'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import SearchBar from '../components/SearchBar.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import Signin from '../components/Signin.jsx'
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
  const [authView, setAuthView] = useState(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Services')
  const openLogin = useCallback(() => setAuthView('login'), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
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
    <>
      <Navbar onLoginClick={openLogin} />
      <main className="min-h-[calc(100vh-76px)] bg-black" id="home">
        <h1 className="sr-only">Salon Services</h1>
        <section
          aria-label="Browse salon services"
          className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[30px] max-[680px]:pb-[58px]"
          id="services"
        >
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
                onBook={openLogin}
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

export default Services
