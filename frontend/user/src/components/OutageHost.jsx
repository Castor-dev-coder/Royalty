import { useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import OutageBanner from './OutageBanner.jsx'
import OutageScreen from './OutageScreen.jsx'
import { retryNow } from '../lib/outage.js'
import { useOutageState } from '../lib/useOutage.js'

// Routes whose views only make sense when their own data loads. When the API
// is unreachable on one of these, the full-page screen replaces the view.
const PROTECTED_PREFIXES = ['/appointments', '/profile', '/change-password', '/my-reviews']

/**
 * Decides how an outage is surfaced:
 *  - full-page screen when the first load failed (nothing on screen yet) or
 *    the visitor is on a protected view that can't load;
 *  - slim banner when public data is already on screen and stays readable.
 */
function OutageHost() {
  const state = useOutageState()
  const location = useLocation()
  const onRetry = useCallback(() => {
    void retryNow()
  }, [])

  if (!state.active) return null

  const protectedView = PROTECTED_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))
  const fullPage = protectedView || !state.hasContent

  if (fullPage) {
    return (
      <OutageScreen
        checking={state.checking}
        lastCheckedAt={state.lastCheckedAt}
        nextRetryAt={state.nextRetryAt}
        onRetry={onRetry}
      />
    )
  }

  return (
    <OutageBanner checking={state.checking} lastCheckedAt={state.lastCheckedAt} onRetry={onRetry} />
  )
}

export default OutageHost
