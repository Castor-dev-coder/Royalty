// Google Identity Services (GIS) bootstrap for the customer app. The GIS
// script loads ONCE per page (a shared promise), failures resolve to `false`
// so Google options can simply hide — the app never blocks on GIS. Nothing
// here touches web storage and no token is ever logged or persisted.

import { ApiError, fetchGoogleNonce } from './api.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

// One script request per page, shared by the sign-in button and One Tap.
let scriptPromise = null
// The active credential consumers (login dialog / one-tap host), most recent
// last. Handlers are unregistered on unmount so a stale closure never signs
// in; when the top handler leaves, the previous one takes over again.
const credentialHandlers = []
let initialized = false
let initializedNonce = null
// The server nonce binds each ID token to this app (single use, 10-minute
// TTL). It is fetched before GIS initializes and refreshed well before the
// TTL so a long-open dialog never sends a stale one.
let nonceValue = null
let nonceFetchedAt = 0
const NONCE_REFRESH_MS = 8 * 60 * 1000
// One Tap may be prompted at most once per page session, and never after
// sign-in (the hosts simply stop calling this once a session exists).
let oneTapPrompted = false

function clientId() {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
}

/** False when no client id is configured — callers hide Google options. */
export function googleSignInConfigured() {
  return clientId() !== ''
}

function gis() {
  return globalThis.window?.google?.accounts?.id ?? null
}

/** Loads the GIS script once. Resolves true/false — never rejects. */
function loadGoogleScript() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const documentRef = globalThis.document
    if (!documentRef) {
      resolve(false)
      return
    }
    if (gis()) {
      resolve(true)
      return
    }
    const script = documentRef.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(Boolean(gis())))
    script.addEventListener('error', () => resolve(false))
    documentRef.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Registers a consumer of Google ID tokens (most recent wins). Returns an
 * unregister function so a host that unmounts never signs in from a stale
 * closure; the previous handler takes over again.
 */
export function setGoogleCredentialHandler(handler) {
  credentialHandlers.push(handler)
  return () => {
    const index = credentialHandlers.lastIndexOf(handler)
    if (index !== -1) credentialHandlers.splice(index, 1)
  }
}

function handleCredential(response) {
  const token = response?.credential
  const handler = credentialHandlers[credentialHandlers.length - 1]
  if (handler && typeof token === 'string' && token !== '') handler(token)
}

/** Resolves the current server nonce, or null when it cannot be issued. */
function ensureNonce() {
  if (nonceValue && Date.now() - nonceFetchedAt < NONCE_REFRESH_MS) {
    return Promise.resolve(nonceValue)
  }
  return fetchGoogleNonce().then(
    (data) => {
      nonceValue = String(data?.nonce || '')
      nonceFetchedAt = Date.now()
      return nonceValue || null
    },
    () => null,
  )
}

/**
 * Loads GIS and initializes it (client id from VITE_GOOGLE_CLIENT_ID,
 * auto_select off, a fresh server nonce). Resolves true when Google sign-in
 * can be offered; a missing nonce hides the Google options (fail closed).
 */
export function ensureGoogleIdentity() {
  if (!googleSignInConfigured()) return Promise.resolve(false)
  return loadGoogleScript().then((loaded) => {
    if (!loaded) return false
    return ensureNonce().then((nonce) => {
      if (!nonce) return false
      try {
        const id = gis()
        if (!id) return false
        if (!initialized || initializedNonce !== nonce) {
          id.initialize({
            client_id: clientId(),
            callback: handleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
            nonce,
          })
          initialized = true
          initializedNonce = nonce
        }
        return true
      } catch {
        return false
      }
    })
  })
}

/** Renders the Google-provided sign-in button into `host`. */
export function renderGoogleButton(host, options) {
  try {
    const id = gis()
    if (!id || !host) return false
    id.renderButton(host, options)
    return true
  } catch {
    return false
  }
}

/** Fires the One Tap prompt at most once per page session. */
export function promptOneTapOnce() {
  if (oneTapPrompted) return false
  oneTapPrompted = true
  try {
    const id = gis()
    if (!id) return false
    id.prompt()
    return true
  } catch {
    return false
  }
}

/** Dismisses any pending One Tap prompt (host unmount / sign-in). */
export function cancelOneTap() {
  try {
    gis()?.cancel?.()
  } catch {
    /* ignore — cancellation is best-effort */
  }
}

/**
 * Human message for a failed Google sign-in. 409 keeps the SERVER message
 * verbatim (e.g. "An account with this email already exists. Sign in with
 * your password to continue."); everything else is the generic failure.
 */
export function googleSignInErrorMessage(error) {
  if (error instanceof ApiError && error.status === 409 && String(error.message || '').trim()) {
    return error.message
  }
  return 'Google sign-in failed. Please try again.'
}
