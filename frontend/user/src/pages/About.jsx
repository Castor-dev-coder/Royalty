import { useCallback, useState } from 'react'
import EmployeeCard from '../components/EmployeeCard.jsx'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import Signin from '../components/Signin.jsx'
import SafeImage from '../components/SafeImage.jsx'
import aboutStats from '../data/about.js'
import employees from '../data/employees.js'

function About() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('royalty-user')) } catch { return null }
  })
  const [authView, setAuthView] = useState(null)
  const openLogin = useCallback(() => setAuthView('login'), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])
  const handleLogout = useCallback(() => {
    localStorage.removeItem('royalty-user')
    setUser(null)
  }, [])

  return (
    <>
      <Navbar onLoginClick={openLogin} onLogout={handleLogout} user={user} />
      <main className="min-h-[calc(100vh-76px)] bg-black" id="home">
        <section
          aria-labelledby="about-heading"
          className="mx-auto mb-14 grid w-[calc(100%-48px)] max-w-341 grid-cols-1 items-start gap-8 pt-21.5 pb-0 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-15 max-[680px]:w-[calc(100%-36px)] max-[680px]:gap-7 max-[680px]:pt-9.5 min-[1400px]:!grid-cols-[540px_700px]"
          id="about"
        >
          <div className="aspect-540/664 w-full overflow-hidden rounded-[18px]">
            <SafeImage
              alt="Stylist curling a client's hair in the salon"
              className="block size-full object-cover"
              src="/images/about/our-story.jpeg"
            />
          </div>

          <div>
            <span className="mb-0.75 inline-block font-salon text-base leading-tight font-semibold tracking-[1.3px] text-(--gold) uppercase">
              OUR STORY
            </span>
            <h1
              className="m-0 mb-8 font-serif text-[clamp(42px,3.89vw,56px)] leading-[1.2] font-semibold italic text-[#f6f2ea]"
              id="about-heading"
            >
              Crafting Beauty
              <span className="mt-1 block text-(--gold)">Since 2018</span>
            </h1>
            <p className="mb-6 font-salon text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Founded in the heart of Quezon City, Royalty Hair and Nails Studio
              was born from a simple vision: every person deserves to feel
              extraordinary. For over eight years, we’ve been transforming
              the way our clients see themselves.
            </p>
            <p className="mb-6 font-salon text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Our team of master stylists and nail technicians bring decades of
              combined expertise to every appointment. We use only premium,
              salon-grade products to ensure results that are as long-lasting as
              they are beautiful.
            </p>
            <blockquote className="my-6 mb-13 border-l-[3px] border-(--gold) bg-[#141311] px-6.75 py-4.25">
              <p className="mb-2.25 font-serif text-[clamp(17px,1.46vw,21px)] leading-[1.4] font-medium italic text-(--gold)">
                “We don’t just style hair and nails — we craft confidence.”
              </p>
              <cite className="font-salon text-[clamp(12px,0.97vw,14px)] leading-[1.3] text-[#a7a198] not-italic">
                — Founder, Royalty Hair and Nails Studio
              </cite>
            </blockquote>
            <div className="grid grid-cols-3 gap-4.5 max-[380px]:gap-2.5">
              {aboutStats.map(({ value, label }) => (
                <div className="flex flex-col gap-1.75" key={label}>
                  <strong className="font-serif text-[clamp(25px,2.36vw,34px)] leading-[1.1] font-semibold text-(--gold)">
                    {value}
                  </strong>
                  <span className="font-sans text-[clamp(10px,0.83vw,12px)] leading-[1.2] font-medium tracking-[0.8px] text-[#a7a198] uppercase">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="team-heading"
          className="pb-16.5 max-[680px]:pb-12"
        >
          <header className="text-center">
            <span className="mb-0.75 inline-block font-salon text-[17.5px] leading-tight font-semibold tracking-[1.3px] text-(--gold) uppercase">
              OUR TEAM
            </span>
            <h2
              className="m-0 font-serif text-[clamp(42px,5.06vw,73px)] leading-[1.05] font-semibold italic text-[#f6f2ea]"
              id="team-heading"
            >
              Meet Our <span className="text-(--gold)">Team</span>
            </h2>
            <p className="mt-5 mb-0 font-salon text-[clamp(16px,1.67vw,24px)] leading-[1.35] text-[#c8c3bb]">
              Skilled. Passionate. Dedicated to your beauty.
            </p>
          </header>

          <div className="mx-auto mt-19 grid w-[calc(100%-128px)] max-w-328 grid-cols-1 gap-9.5 max-[680px]:mt-9.5 max-[680px]:mx-auto max-[680px]:w-[calc(100%-36px)] xl:grid-cols-2 min-[1400px]:!ml-16! min-[1400px]:!mr-0 min-[1400px]:!w-328!">
            {employees.map((employee) => (
              <EmployeeCard key={employee.id} {...employee} />
            ))}
          </div>
        </section>
      </main>
      <Footer user={user} onLoginClick={openLogin} />
      {authView === 'login' && (
        <Login onClose={closeAuth} onSwitch={switchAuth} onLogin={setUser} />
      )}
      {authView === 'signin' && (
        <Signin onClose={closeAuth} onSwitch={switchAuth} onLogin={setUser} />
      )}
    </>
  )
}

export default About
