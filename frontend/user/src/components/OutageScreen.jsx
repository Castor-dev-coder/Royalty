import { useEffect, useRef, useState } from 'react'
import BrandMark from './BrandMark.jsx'

// Full-viewport outage screen. Shown when the API is confirmed unreachable
// (see lib/outage.js for the trigger) and there is no content worth keeping on
// screen. Deliberately bare: no error codes, no stack traces — just what the
// visitor can do next. The app stays mounted underneath, so anything they were
// typing (like a review draft) is still there when the screen dismisses.

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function OutageScreen({ lastCheckedAt, nextRetryAt, checking, onRetry }) {
  const [now, setNow] = useState(() => Date.now())
  const retryButtonRef = useRef(null)

  // Focus lands on the button so keyboard users can act immediately.
  useEffect(() => {
    retryButtonRef.current?.focus()
  }, [])

  // Block page scroll while the takeover is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Ticks once a second to keep the countdown honest.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsLeft = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : 0

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#0a0a09]">
      <div className="mx-auto flex min-h-svh w-[min(100%-40px,640px)] flex-col items-center justify-center py-14 text-center">
        <div role="alert">
          <BrandMark className="mx-auto h-14 w-auto opacity-95" />
          <p className="mt-6 text-[11px] font-semibold tracking-[0.32em] text-(--gold) uppercase">
            Royalty Hair &amp; Nails Studio
          </p>
          <h1 className="mt-4 font-(--serif) text-[clamp(36px,7vw,60px)] leading-[1.05] font-light text-[#f4f1eb]">
            We&apos;ll be right back
          </h1>
          <p className="mx-auto mt-5 max-w-[420px] text-[15px] leading-[1.75] text-[#d8d4cb]">
            We can&apos;t reach the salon server right now. Your session is safe —
            we&apos;ll reconnect and reload this page automatically.
          </p>
        </div>

        <button
          className="btn-pill mt-9 inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-full border border-(--gold) bg-(--gold) px-8 py-3 text-[13px] font-bold tracking-[0.14em] text-[#15120b] uppercase hover:bg-(--gold-bright) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--gold)"
          onClick={onRetry}
          ref={retryButtonRef}
          type="button"
        >
          {checking ? 'Checking…' : 'Try again'}
        </button>

        <p aria-hidden="true" className="mt-5 text-[13px] tracking-[0.08em] text-[#b3ada2]">
          {checking
            ? 'Checking the connection…'
            : nextRetryAt
              ? `Automatic retry in ${secondsLeft}s`
              : 'Automatic retry scheduled'}
        </p>

        <p className="mt-8 text-[11px] tracking-[0.18em] text-[#8d877c] uppercase">
          {lastCheckedAt ? `Last checked ${formatClock(lastCheckedAt)}` : 'Checking the connection…'}
        </p>
      </div>
    </div>
  )
}

export default OutageScreen
