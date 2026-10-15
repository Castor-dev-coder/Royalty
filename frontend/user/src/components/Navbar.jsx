import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

const links = [
  { label: 'HOME', to: '/' },
  { label: 'SERVICES', to: '/services' },
  { label: 'REVIEWS', to: '/reviews' },
  { label: 'ABOUT',to: '/about' },
]

const linkClass =
  'type-nav-link relative inline-block py-[0.6rem] pb-[0.7rem] text-[#f4f1eb] no-underline transition-[color,font-weight] duration-[180ms] after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--gold)] after:transition-transform after:duration-[180ms] hover:text-[var(--gold)] hover:after:scale-x-100 aria-[current=page]:text-[var(--gold)] aria-[current=page]:after:scale-x-100 max-[680px]:block max-[680px]:py-3'

function Navbar({ onLoginClick }) {
  const { pathname } = useLocation()
  const [activeHash, setActiveHash] = useState(window.location.hash)
  const [menuOpen, setMenuOpen] = useState(false)

  function handleRouteClick() {
    setActiveHash('')
    setMenuOpen(false)
  }

  function handleHashClick(hash) {
    setActiveHash(hash)
    setMenuOpen(false)
  }

  function isActive(item) {
    if (item.to) return pathname === item.to && !activeHash
    return pathname === '/' && activeHash === item.hash
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[rgba(212,180,92,0.12)] bg-[rgba(10,10,10,0.84)] backdrop-blur-[16px]">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-[76px] w-[min(100%-48px,1180px)] items-center justify-between gap-8 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:min-h-[68px]"
      >
        <Link
          className="flex shrink-0 items-center gap-2 text-[var(--text)] no-underline"
          to="/"
          onClick={handleRouteClick}
          aria-label="Royalty Hair and Nails Studio home"
        >
          <BrandMark className="size-10 max-[680px]:size-9" />
          <span className="flex flex-col leading-[1.15]">
            <strong className="type-brand-name text-[var(--gold)]">
              Royalty
            </strong>
            <small className="type-brand-caption mt-[3px] text-[#c7c1b4]">
              HAIR &amp; NAILS STUDIO
            </small>
          </span>
        </Link>

        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="hidden size-[42px] cursor-pointer flex-col items-center justify-center gap-[5px] rounded-[2px] border border-[var(--line)] bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-bright)] max-[680px]:flex"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span
            className={`h-px w-[18px] bg-[var(--gold)] transition-[transform,opacity] duration-[180ms] ${menuOpen ? 'translate-y-[6px] rotate-45' : ''}`}
          />
          <span
            className={`h-px w-[18px] bg-[var(--gold)] transition-[transform,opacity] duration-[180ms] ${menuOpen ? 'opacity-0' : ''}`}
          />
          <span
            className={`h-px w-[18px] bg-[var(--gold)] transition-[transform,opacity] duration-[180ms] ${menuOpen ? '-translate-y-[6px] -rotate-45' : ''}`}
          />
        </button>

        <div
          className={`flex items-center gap-[clamp(1.6rem,4vw,4rem)] max-[680px]:absolute max-[680px]:top-[calc(100%+1px)] max-[680px]:right-0 max-[680px]:left-0 max-[680px]:items-stretch max-[680px]:flex-col max-[680px]:gap-5 max-[680px]:border-b max-[680px]:border-[var(--line)] max-[680px]:bg-[rgba(10,10,10,0.98)] max-[680px]:px-6 max-[680px]:pt-5 max-[680px]:pb-6 ${menuOpen ? 'max-[680px]:flex' : 'max-[680px]:hidden'}`}
        >
          <ul className="m-0 flex list-none items-center gap-[clamp(1.2rem,3vw,2.6rem)] p-0 max-[680px]:items-stretch max-[680px]:flex-col max-[680px]:gap-1">
            {links.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link
                    to={item.to}
                    aria-current={isActive(item) ? 'page' : undefined}
                    className={linkClass}
                    onClick={handleRouteClick}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={`/${item.hash}`}
                    aria-current={isActive(item) ? 'page' : undefined}
                    className={linkClass}
                    onClick={() => handleHashClick(item.hash)}
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <button
            className="type-nav-action inline-flex min-h-[25px] cursor-pointer items-center justify-center rounded-[3px] border border-[var(--gold)] bg-[var(--gold)] px-[.8rem] py-[0.8rem] text-[#111] transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--gold-bright)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-bright)] max-[680px]:w-full"
            onClick={() => {
              setMenuOpen(false)
              onLoginClick()
            }}
            type="button"
          >
            LOGIN
          </button>
        </div>
      </nav>
    </header>
  )
}

export default Navbar