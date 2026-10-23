import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { subscribeDialogs } from '../utils/dialog-stack.js'

const SUPPRESSED_ROUTES = ['/services', '/appointments']

// Restrained mobile-only floating action: straight to the services catalogue,
// which is the application's real booking entry point. Hidden while the footer
// is on screen, while a dialog is open, and on the booking-centric routes.
function MobileBookCTA() {
  const { pathname } = useLocation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [footerVisible, setFooterVisible] = useState(false)

  useEffect(() => subscribeDialogs(setDialogOpen), [])

  useEffect(() => {
    const footer = document.querySelector('.site-footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      { threshold: 0.02 },
    )
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  const hidden =
    dialogOpen || footerVisible || SUPPRESSED_ROUTES.includes(pathname)

  return (
    <Link
      aria-label="Book an appointment at Royalty Salon"
      className={`mobile-book-cta${hidden ? ' mobile-book-cta-hidden' : ''}`}
      tabIndex={hidden ? -1 : 0}
      to="/services"
    >
      <svg
        aria-hidden="true"
        className="size-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
        viewBox="0 0 24 24"
      >
        <rect height="17" rx="2" width="18" x="3" y="4" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </svg>
      <span>Book</span>
    </Link>
  )
}

export default MobileBookCTA
