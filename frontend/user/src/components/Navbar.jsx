import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

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
  'type-nav-link relative inline-block py-[0.6rem] pb-[0.7rem] text-[#f4f1eb] no-underline transition-[color,font-weight] duration-[180ms] after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--gold)] after:transition-transform after:duration-[180ms] hover:text-[var(--gold)] hover:after:scale-x-100 aria-[current=page]:text-[var(--gold)] aria-[current=page]:after:scale-x-100 max-[680px]:block max-[680px]:py-3'

function Navbar({ onLoginClick, user, onLogout }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
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
            {(user ? signedInLinks : signedOutLinks).map((item) => (
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
          {user ? (
            <div className="flex items-center gap-4 max-[680px]:w-full max-[680px]:justify-end">
              <button
                aria-label="Notifications"
                className="grid size-9 place-items-center rounded-full text-[#f4f1eb] transition-colors hover:text-[var(--gold)]"
                type="button"
              >
                <svg aria-hidden="true" className="size-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
                  <path d="M9.5 21h5" />
                </svg>
              </button>
              <div className="group relative">
              <button
                className="type-nav-action inline-flex min-h-[52px] min-w-[100px] cursor-pointer items-center justify-center gap-4 rounded-[3px] border border-[var(--gold)] bg-transparent px-3 py-2 text-[#f4f1eb] transition-[background-color,color] duration-[180ms] hover:bg-[rgba(212,180,92,.12)]"
                type="button"
                aria-label={`Signed in as ${user.name}`}
              >
                <svg aria-hidden="true" className="size-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.25]" viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="3.5" />
                  <path d="M5 20c.5-3.5 2.8-5.5 7-5.5s6.5 2 7 5.5" />
                </svg>
                <svg aria-hidden="true" className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24">
                  <path d="m5 9 7 7 7-7" />
                </svg>
              </button>
              <div className="invisible absolute top-full right-0 z-50 mt-2 min-w-[150px] rounded border border-[var(--line)] bg-[#15130f] p-2 opacity-0 shadow-xl transition-[opacity,visibility] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 max-[680px]:right-0">
                <p className="m-2 truncate text-[10px] text-[#aaa49a]">{user.email}</p>
                <button type="button" onClick={() => navigate('/profile')} className="w-full rounded px-2 py-2 text-left text-xs text-[#eeeae2] hover:bg-[rgba(212,180,92,.12)]">Profile</button>
                <button type="button" onClick={onLogout} className="w-full rounded px-2 py-2 text-left text-xs text-[var(--gold)] hover:bg-[rgba(212,180,92,.12)]">Sign out</button>
              </div>
              </div>
            </div>
          ) : (
            <button
              className="type-nav-action inline-flex min-h-[25px] cursor-pointer items-center justify-center rounded-[3px] border border-[var(--gold)] bg-[var(--gold)] px-[.8rem] py-[0.8rem] text-[#111] transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-[var(--gold-bright)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-bright)] max-[680px]:w-full"
              onClick={() => { setMenuOpen(false); onLoginClick() }}
              type="button"
            >LOGIN</button>
          )}
        </div>
      </nav>
    </header>
  )
}

export default Navbar