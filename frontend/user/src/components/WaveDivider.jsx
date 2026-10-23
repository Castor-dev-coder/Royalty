import { useEffect, useRef, useState } from 'react'

// A thin gold wave line placed between page sections. The path draws itself
// once when it scrolls into view and stays static afterwards; under
// prefers-reduced-motion the global transition rules render it immediately.
function WaveDivider({ className = '' }) {
  const holderRef = useRef(null)
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return undefined
    if (typeof IntersectionObserver === 'undefined') return undefined

    function reveal() {
      setVisible(true)
      observer.disconnect()
      window.removeEventListener('scroll', revealIfPassed)
      window.removeEventListener('resize', revealIfPassed)
    }

    // Jumps (deep links, restored scroll positions) can carry the line from
    // below to above the viewport without ever sampling it as visible, so a
    // passive scroll check covers the already-passed case. Both listeners
    // remove themselves once the line has been revealed.
    function revealIfPassed() {
      if (holder.getBoundingClientRect().bottom < 0) reveal()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(holder)
    window.addEventListener('scroll', revealIfPassed, { passive: true })
    window.addEventListener('resize', revealIfPassed)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', revealIfPassed)
      window.removeEventListener('resize', revealIfPassed)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={`wave-divider -my-6 max-[680px]:-my-4 ${className}`}
      data-visible={visible ? 'true' : 'false'}
      ref={holderRef}
    >
      <svg
        aria-hidden="true"
        className="block h-[42px] w-full max-[680px]:h-[34px]"
        preserveAspectRatio="none"
        viewBox="0 0 1440 60"
      >
        <path
          d="M-6 30 C 160 12 320 12 480 30 S 800 48 960 30 S 1280 12 1446 30"
          fill="none"
          pathLength="1"
          stroke="var(--wave-gold)"
          strokeLinecap="round"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

export default WaveDivider
