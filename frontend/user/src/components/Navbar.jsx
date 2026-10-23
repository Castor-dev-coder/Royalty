import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

import { useToast } from '../context/useToast.jsx'
import { useTheme } from '../context/useTheme.jsx'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className="grid size-9 cursor-pointer place-items-center rounded-full text-[#f4f1eb] transition-colors hover:text-(--gold)"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
    >
      {isDark ? (
        <svg aria-hidden="true" className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.6]" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="size-5 fill-current" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

const signedOutLinks = [
  { label: 'HOME', to: '/' },
  { label: 'SERVICES', to: '/services' },
  { label: 'REVIEWS', to: '/reviews' },
  { label: 'ABOUT', to: '/about' },
]

const signedInLinks = [
  { label: 'SERVICES', to: '/services' },
  { label: 'APPOINTMENTS', to: '/appointments' },
  { label: 'REVIEWS', to: '/reviews' },
]

const linkClass =
  'type-nav-link relative inline-block py-[0.6rem] pb-[0.7rem] text-[#f4f1eb] no-underline transition-colors duration-180 after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:origin-left after:scale-x-0 after:bg-(--gold) after:transition-transform after:duration-180 hover:text-(--gold) hover:after:scale-x-100 aria-[current=page]:text-(--gold) aria-[current=page]:after:scale-x-100 max-[900px]:block max-[900px]:py-3'

function Navbar({ onLoginClick, user, onLogout }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeHash, setActiveHash] = useState(window.location.hash)
  // Open state is scoped to the route it was opened on, so navigating (or
  // pressing Back) closes both menus without extra effects.
  const [menuOpenAt, setMenuOpenAt] = useState(null)
  const [accountOpenAt, setAccountOpenAt] = useState(null)
  const menuOpen = menuOpenAt === pathname
  const accountOpen = accountOpenAt === pathname
  const accountRef = useRef(null)
  const accountButtonRef = useRef(null)

  // The account menu closes on outside click and on Escape.
  useEffect(() => {
    if (!accountOpen) return undefined
    function handlePointerDown(event) {
      if (!accountRef.current?.contains(event.target)) setAccountOpenAt(null)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setAccountOpenAt(null)
        accountButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountOpen])

  function handleRouteClick() {
    setActiveHash('')
    setMenuOpenAt(null)
  }

  // Route links navigate normally (default <Link> behavior, including
  // modified clicks and browser history). Section anchors scroll to their
  // target on the homepage instead of following the dummy href.
  function handleNavClick(event, item) {
    if (event.defaultPrevented) return

    if (!item.hash) {
      handleRouteClick()
      return
    }

    event.preventDefault()
    setActiveHash(item.hash)
    setMenuOpenAt(null)
    const scroll = () => document.getElementById(item.hash)?.scrollIntoView({ behavior: 'auto' })
    if (pathname !== '/') {
      navigate('/')
      window.setTimeout(scroll, 60)
    } else {
      scroll()
    }
  }

  function isActive(item) {
    if (item.to) return pathname === item.to && !activeHash
    return pathname === '/' && activeHash === item.hash
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[rgba(212,180,92,0.12)] bg-[rgba(10,10,10,0.84)] backdrop-blur-lg">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-19 w-[min(100%-48px,1180px)] items-center justify-between gap-8 max-[600px]:w-[min(100%-36px,1180px)] max-[900px]:min-h-17"
      >
        <Link
          className="flex shrink-0 items-center gap-2 text-(--text) no-underline"
          to="/"
          onClick={handleRouteClick}
          aria-label="Royalty Hair and Nails Studio home"
        >
          <BrandMark className="size-10 max-[900px]:size-9" />
          <span className="flex flex-col leading-[1.15]">
            <strong className="type-brand-name text-(--gold)">
              Royalty
            </strong>
            <small className="type-brand-caption mt-0.75 text-[#c7c1b4]">
              HAIR &amp; NAILS STUDIO
            </small>
          </span>
        </Link>

        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="hidden size-11 cursor-pointer flex-col items-center justify-center gap-1.25 rounded-xs border border-(--line) bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold-bright) max-[900px]:flex"
          onClick={() => setMenuOpenAt(menuOpen ? null : pathname)}
          type="button"
        >
          <span
            className={`h-px w-4.5 bg-(--gold) transition-[transform,opacity] duration-180 ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`}
          />
          <span
            className={`h-px w-4.5 bg-(--gold) transition-[transform,opacity] duration-180 ${menuOpen ? 'opacity-0' : ''}`}
          />
          <span
            className={`h-px w-4.5 bg-(--gold) transition-[transform,opacity] duration-180 ${menuOpen ? '-translate-y-1.5 -rotate-45' : ''}`}
          />
        </button>

        <div
          className={`flex items-center gap-[clamp(1.6rem,4vw,4rem)] max-[900px]:absolute max-[900px]:top-[calc(100%+1px)] max-[900px]:right-0 max-[900px]:left-0 max-[900px]:items-stretch max-[900px]:flex-col max-[900px]:gap-5 max-[900px]:border-b max-[900px]:border-[var(--line)] max-[900px]:bg-[rgba(10,10,10,0.98)] max-[900px]:px-6 max-[900px]:pt-5 max-[900px]:pb-6 max-[900px]:transition-[opacity,transform,visibility] max-[900px]:duration-[200ms] ${menuOpen ? 'max-[900px]:visible max-[900px]:translate-y-0 max-[900px]:opacity-100' : 'max-[900px]:invisible max-[900px]:-translate-y-1 max-[900px]:pointer-events-none max-[900px]:opacity-0'}`}
        >
          <ul className="m-0 flex list-none items-center gap-[clamp(1.2rem,3vw,2.6rem)] p-0 max-[900px]:items-stretch max-[900px]:flex-col max-[900px]:gap-1">
            {(user ? signedInLinks : signedOutLinks).map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link
                    to={item.to}
                    aria-current={isActive(item) ? 'page' : undefined}
                    className={linkClass}
                    onClick={(event) => handleNavClick(event, item)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={`/${item.hash}`}
                    aria-current={isActive(item) ? 'page' : undefined}
                    className={linkClass}
                    onClick={(event) => handleNavClick(event, item)}
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {user ? (
            <div className="flex items-center gap-4 max-[900px]:w-full max-[900px]:justify-end">
              <button
                aria-label="Notifications"
                className="grid size-9 place-items-center rounded-full text-[#f4f1eb] transition-colors hover:text-(--gold)"
                onClick={() => showToast('info', 'Notifications are not connected yet.')}
                type="button"
              >
                <svg aria-hidden="true" className="size-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.7]" viewBox="0 0 24 24">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
                  <path d="M9.5 21h5" />
                </svg>
              </button>
              <ThemeToggle />
              <div className="relative" ref={accountRef}>
              <button
                className="btn-pill type-nav-action inline-flex min-h-11 cursor-pointer items-center justify-center gap-2.5 rounded-full border border-(--gold) bg-transparent px-4 py-2 text-[#f4f1eb] hover:bg-[rgba(212,180,92,.14)] aria-expanded:bg-[rgba(212,180,92,.14)]"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpenAt(accountOpen ? null : pathname)}
                ref={accountButtonRef}
                type="button"
                aria-label={`Signed in as ${user.name}`}
              >
                <svg aria-hidden="true" className="size-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.25]" viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="3.5" />
                  <path d="M5 20c.5-3.5 2.8-5.5 7-5.5s6.5 2 7 5.5" />
                </svg>
                <svg aria-hidden="true" className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.5]" viewBox="0 0 24 24">
                  <path d="m5 9 7 7 7-7" />
                </svg>
              </button>
              <div className={`absolute top-full right-0 z-50 mt-2 min-w-37.5 rounded border border-(--line) bg-[#15130f] p-2 shadow-xl transition-[opacity,visibility] duration-[160ms] max-[900px]:right-0 ${accountOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
                <p className="m-2 truncate text-[12px] text-[#aaa49a]">{user.email}</p>
                <button type="button" onClick={() => { setAccountOpenAt(null); navigate('/profile') }} className="w-full rounded px-2.5 py-2 text-left text-[13px] text-[#eeeae2] hover:bg-[rgba(212,180,92,.12)]">Profile</button>
                <button type="button" onClick={() => { setAccountOpenAt(null); navigate('/my-reviews') }} className="w-full rounded px-2.5 py-2 text-left text-[13px] text-[#eeeae2] hover:bg-[rgba(212,180,92,.12)]">My reviews</button>
                <button type="button" onClick={() => { setAccountOpenAt(null); onLogout() }} className="w-full rounded px-2.5 py-2 text-left text-[13px] text-(--gold) hover:bg-[rgba(212,180,92,.12)]">Sign out</button>
              </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 max-[900px]:w-full max-[900px]:justify-end">
              <ThemeToggle />
              <button
                className="btn-pill type-nav-action inline-flex min-h-6.25 cursor-pointer items-center justify-center rounded-full border border-(--gold) bg-(--gold) px-[.8rem] py-[0.8rem] text-[#111] hover:bg-(--gold-bright) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold-bright) max-[900px]:w-full"
                onClick={() => { setMenuOpenAt(null); onLoginClick() }}
                type="button"
              >LOGIN</button>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}

export default Navbar