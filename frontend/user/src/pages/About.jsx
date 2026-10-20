import { useCallback, useState } from 'react'
import EmployeeCard from '../components/EmployeeCard.jsx'
import Footer from '../components/Footer.jsx'
import Login from '../components/Login.jsx'
import Navbar from '../components/Navbar.jsx'
import Signin from '../components/Signin.jsx'
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
          className="mx-auto mb-[56px] grid w-[calc(100%-48px)] max-w-[1364px] grid-cols-1 items-start gap-8 pt-[86px] pb-0 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-[60px] max-[680px]:w-[calc(100%-36px)] max-[680px]:gap-7 max-[680px]:pt-[38px] min-[1400px]:!grid-cols-[540px_700px]"
          id="about"
        >
          <div className="aspect-[540/664] w-full overflow-hidden rounded-[18px]">
            <img
              alt="Stylist curling a client's hair in the salon"
              className="block size-full object-cover"
              src="/images/about/our-story.jpeg"
            />
          </div>

          <div>
            <span className="mb-[2px] inline-block font-[family-name:var(--font-salon)] text-[16px] leading-[1.25] font-semibold tracking-[1.3px] text-[var(--gold)] uppercase">
              OUR STORY
            </span>
            <h1
              className="m-0 mb-[32px] font-[family-name:var(--font-serif)] text-[clamp(42px,3.89vw,56px)] leading-[1.2] font-semibold italic text-[#f6f2ea]"
              id="about-heading"
            >
              Crafting Beauty
              <span className="mt-1 block text-[var(--gold)]">Since 2018</span>
            </h1>
            <p className="mb-6 font-[family-name:var(--font-salon)] text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Founded in the heart of Quezon City, Royalty Hair and Nails Studio
              was born from a simple vision: every person deserves to feel
              extraordinary. For over eight years, we’ve been transforming
              the way our clients see themselves.
            </p>
            <p className="mb-6 font-[family-name:var(--font-salon)] text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Our team of master stylists and nail technicians bring decades of
              combined expertise to every appointment. We use only premium,
              salon-grade products to ensure results that are as long-lasting as
              they are beautiful.
            </p>
            <blockquote className="my-6 mb-[52px] border-l-[3px] border-[var(--gold)] bg-[#141311] px-[27px] py-[17px]">
              <p className="mb-[9px] font-[family-name:var(--font-serif)] text-[clamp(17px,1.46vw,21px)] leading-[1.4] font-medium italic text-[var(--gold)]">
                “We don’t just style hair and nails — we craft confidence.”
              </p>
              <cite className="font-[family-name:var(--font-salon)] text-[clamp(12px,0.97vw,14px)] leading-[1.3] text-[#a7a198] not-italic">
                — Founder, Royalty Hair and Nails Studio
              </cite>
            </blockquote>
            <div className="grid grid-cols-3 gap-[18px] max-[380px]:gap-[10px]">
              {aboutStats.map(({ value, label }) => (
                <div className="flex flex-col gap-[7px]" key={label}>
                  <strong className="font-[family-name:var(--font-serif)] text-[clamp(25px,2.36vw,34px)] leading-[1.1] font-semibold text-[var(--gold)]">
                    {value}
                  </strong>
                  <span className="font-[family-name:var(--font-sans)] text-[clamp(10px,0.83vw,12px)] leading-[1.2] font-medium tracking-[0.8px] text-[#a7a198] uppercase">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="team-heading"
          className="pb-[66px] max-[680px]:pb-[48px]"
        >
          <header className="text-center">
            <span className="mb-[3px] inline-block font-[family-name:var(--font-salon)] text-[17.5px] leading-[1.25] font-semibold tracking-[1.3px] text-[var(--gold)] uppercase">
              OUR TEAM
            </span>
            <h2
              className="m-0 font-[family-name:var(--font-serif)] text-[clamp(42px,5.06vw,73px)] leading-[1.05] font-semibold italic text-[#f6f2ea]"
              id="team-heading"
            >
              Meet Our <span className="text-[var(--gold)]">Team</span>
            </h2>
            <p className="mt-[20px] mb-0 font-[family-name:var(--font-salon)] text-[clamp(16px,1.67vw,24px)] leading-[1.35] text-[#c8c3bb]">
              Skilled. Passionate. Dedicated to your beauty.
            </p>
          </header>

          <div className="mx-auto mt-[76px] grid w-[calc(100%-128px)] max-w-[1312px] grid-cols-1 gap-[38px] max-[680px]:mt-[38px] max-[680px]:mx-auto max-[680px]:w-[calc(100%-36px)] xl:grid-cols-2 min-[1400px]:!ml-[64px] min-[1400px]:!mr-0 min-[1400px]:!w-[1312px]">
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
