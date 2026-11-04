import { useEffect } from 'react'
import { useAuth } from '../context/useAuth.jsx'
import {
  cancelOneTap,
  ensureGoogleIdentity,
  promptOneTapOnce,
  setGoogleCredentialHandler,
} from '../lib/googleAuth.js'

// Google One Tap for signed-out visitors: invisible host, prompted at most
// once per page session and never after sign-in. GIS failures just mean no
// prompt — the app never blocks on Google. Errors surface as a console-free
// silent skip (the login dialog carries the visible error messaging).
function GoogleOneTap() {
  const { user, restoring, signInWithGoogle } = useAuth()

  useEffect(() => {
    // Only signed-out visitors, and only once the silent restore settled.
    if (user || restoring) return undefined
    let cancelled = false
    const unregister = setGoogleCredentialHandler((idToken) => {
      signInWithGoogle(idToken).catch(() => {
        // Leave the visitor signed out; sign-in stays available in the dialog.
      })
    })
    ensureGoogleIdentity().then((ready) => {
      if (cancelled || !ready) return
      promptOneTapOnce()
    })
    return () => {
      cancelled = true
      unregister()
      cancelOneTap()
    }
  }, [user, restoring, signInWithGoogle])

  return null
}

export default GoogleOneTap
