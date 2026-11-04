import { useSyncExternalStore } from 'react'
import { getOutageState, subscribeOutage } from './outage.js'

/** Live outage state: { active, checking, lastCheckedAt, nextRetryAt, … }. */
export function useOutageState() {
  return useSyncExternalStore(subscribeOutage, getOutageState, getOutageState)
}

/**
 * Counter that ticks once per recovery. Add it to a data-loading effect's
 * dependencies so the page refetches when the outage screen dismisses itself.
 */
export function useRecoveryTick() {
  return useSyncExternalStore(
    subscribeOutage,
    () => getOutageState().recoveryTick,
    () => 0,
  )
}
