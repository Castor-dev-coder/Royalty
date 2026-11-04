import { useEffect, useRef } from 'react'

/**
 * Background refresh for signed-in data pages.
 *
 * Refetches on window focus, on the browser's 'online' event, and on a 45s
 * timer with ±5s jitter — only while the tab is visible and `enabled`
 * (signed in). Exactly one request is in flight at a time; failed refreshes
 * back off (x2 per consecutive failure, capped at 5 minutes) and the schedule
 * resets to the base interval on success. While `paused` (an open form or an
 * in-progress upload/submit) refreshes are skipped entirely so nothing the
 * user is working on is overwritten.
 *
 * `refetch` resolves true on success and false on failure (a skipped/failed
 * conditional GET that changed nothing counts as success).
 */
export function useAutoRefresh(refetch, { enabled, paused = false }) {
  const refetchRef = useRef(refetch)
  const pausedRef = useRef(paused)

  // Kept out of render: the scheduler always calls the latest callbacks.
  useEffect(() => {
    refetchRef.current = refetch
    pausedRef.current = paused
  })

  useEffect(() => {
    if (!enabled) return undefined

    let stopped = false
    let timer = null
    let inFlight = false
    let failures = 0

    const schedule = () => {
      if (stopped) return
      if (timer) window.clearTimeout(timer)
      const base = Math.min(45000 * 2 ** failures, 300000)
      const jitter = Math.random() * 10000 - 5000
      timer = window.setTimeout(run, Math.max(1000, base + jitter))
    }

    const run = async () => {
      // One request in flight: a tick during a slow fetch just reschedules.
      if (stopped || inFlight) {
        schedule()
        return
      }
      if (document.visibilityState !== 'visible' || pausedRef.current) {
        schedule()
        return
      }
      inFlight = true
      let ok
      try {
        ok = (await refetchRef.current()) !== false
      } catch {
        ok = false
      } finally {
        inFlight = false
      }
      failures = ok ? 0 : failures + 1
      schedule()
    }

    const trigger = () => {
      if (stopped || inFlight) return
      if (document.visibilityState !== 'visible' || pausedRef.current) return
      void run()
    }

    window.addEventListener('focus', trigger)
    window.addEventListener('online', trigger)
    schedule()

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('focus', trigger)
      window.removeEventListener('online', trigger)
    }
  }, [enabled])
}
