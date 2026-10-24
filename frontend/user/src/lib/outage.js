// API outage detection and recovery for the customer app.
//
// Trigger rule: the API counts as unreachable only when a real request fails
// with a network error or a 5xx AND a lightweight GET /health fails too — on
// two consecutive checks. A lone failed call, an aborted request, or any
// 4xx answer (401/403/404/409/400) never triggers the outage screen: a 4xx
// proves the server is alive, and one failed call may be a fluke.
//
// While an outage is active the module retries /health on a backoff schedule
// (5s, 10s, 20s, 30s, 30s …) and notifies subscribers on every state change,
// including recovery. It never touches the session: tokens, the auth hint and
// anything the user is typing stay exactly as they are.

// Keep in step with api.js (duplicated on purpose: this module must not
// import the request layer it feeds back into).
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const HEALTH_PATH = '/health'
const HEALTH_TIMEOUT_MS = 5000

/** Automatic retry backoff; the last entry repeats forever. */
export const RETRY_BACKOFF_MS = [5000, 10000, 20000, 30000]

const listeners = new Set()

let snapshot = {
  active: false, // outage screen showing
  checking: false, // a health check is in flight
  lastCheckedAt: null, // Date.now() of the last completed health check
  nextRetryAt: null, // Date.now() when the automatic retry fires
  recoveryTick: 0, // bumped once per recovery — pages refetch on it
  hasContent: false, // some public data finished loading this session
}

function update(patch) {
  let changed = false
  for (const key of Object.keys(patch)) {
    if (snapshot[key] !== patch[key]) {
      changed = true
      break
    }
  }
  if (!changed) return
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeOutage(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOutageState() {
  return snapshot
}

// --- health probe -----------------------------------------------------------

async function probeHealth() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${HEALTH_PATH}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// --- state machine ----------------------------------------------------------

let failedChecks = 0 // consecutive (failed request + failed health) pairs
let queuedProbe = false // another request failed while a probe was running
let healthInFlight = null
let retryTimer = null
let retryStep = 0

/**
 * The server answered with something below 500 — it is alive. Breaks the
 * failure streak and, if an outage screen was up, dismisses it.
 * `content` marks a successful non-auth GET whose data is now on screen.
 */
export function noteResponse({ content = false } = {}) {
  failedChecks = 0
  queuedProbe = false
  if (snapshot.active) recover()
  if (content && !snapshot.hasContent) update({ hasContent: true })
}

/** A real request failed with a network error or a 5xx: pair it with a probe. */
export function noteFailure() {
  void runCheck()
}

async function runCheck() {
  if (healthInFlight) {
    // Coalesce bursts: one more probe afterwards covers the queued failure.
    queuedProbe = true
    return healthInFlight
  }
  const run = (async () => {
    update({ checking: true })
    const ok = await probeHealth()
    healthInFlight = null
    update({ checking: false, lastCheckedAt: Date.now() })
    if (ok) {
      failedChecks = 0
      queuedProbe = false
      if (snapshot.active) recover()
      return
    }
    failedChecks += 1
    if (snapshot.active) {
      scheduleRetry()
    } else if (failedChecks >= 2) {
      update({ active: true })
      scheduleRetry()
    } else if (queuedProbe) {
      queuedProbe = false
      void runCheck()
    }
  })()
  healthInFlight = run
  return run
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  const delay = RETRY_BACKOFF_MS[Math.min(retryStep, RETRY_BACKOFF_MS.length - 1)]
  retryStep += 1
  update({ nextRetryAt: Date.now() + delay })
  retryTimer = setTimeout(() => {
    retryTimer = null
    void runCheck()
  }, delay)
}

function recover() {
  failedChecks = 0
  queuedProbe = false
  retryStep = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  update({ active: false, nextRetryAt: null, recoveryTick: snapshot.recoveryTick + 1 })
}

/** The "Try again" button: check immediately and restart the backoff at 5s. */
export function retryNow() {
  retryStep = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  return runCheck()
}

/** Test-only: drop all state and timers. */
export function resetOutageState() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  healthInFlight = null
  failedChecks = 0
  queuedProbe = false
  retryStep = 0
  snapshot = {
    active: false,
    checking: false,
    lastCheckedAt: null,
    nextRetryAt: null,
    recoveryTick: 0,
    hasContent: false,
  }
}
