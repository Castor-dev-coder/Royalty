import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth.jsx'
import {
  ensureGoogleIdentity,
  googleSignInErrorMessage,
  renderGoogleButton,
  setGoogleCredentialHandler,
} from '../lib/googleAuth.js'

// 'Continue with Google' block for the login dialog: the OR divider plus the
// Google-provided button (rendered by Google Identity Services into the host
// div). When GIS cannot load — no client id, blocked script, no browser
// support — the whole block hides and password login keeps working untouched.
function GoogleSignInButton({ onSignedIn }) {
  const { signInWithGoogle } = useAuth()
  const hostRef = useRef(null)
  // Callbacks move through refs so typing in the login form (parent state)
  // never tears down and re-renders the Google button.
  const onSignedInRef = useRef(onSignedIn)
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onSignedInRef.current = onSignedIn
  }, [onSignedIn])

  useEffect(() => {
    let cancelled = false
    const unregister = setGoogleCredentialHandler((idToken) => {
      setMessage('')
      setBusy(true)
      signInWithGoogle(idToken).then(
        (user) => {
          if (cancelled) return
          setBusy(false)
          onSignedInRef.current?.(user)
        },
        (error) => {
          if (cancelled) return
          setBusy(false)
          setMessage(googleSignInErrorMessage(error))
        },
      )
    })
    ensureGoogleIdentity().then((ready) => {
      if (cancelled || !ready) return
      // The host stays hidden until the button exists — no empty divider flash.
      const rendered = renderGoogleButton(hostRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rect',
        width: 320,
      })
      if (rendered) setAvailable(true)
    })
    return () => {
      cancelled = true
      unregister()
    }
  }, [signInWithGoogle])

  return (
    <div className={available ? 'w-full' : 'hidden'}>
      <div className="relative my-[21px] w-full text-center text-[0.58rem] text-[#77736b] before:absolute before:top-1/2 before:right-0 before:left-0 before:h-px before:bg-[#34322e] before:content-['']">
        <span className="relative bg-[#11110f] px-3">OR</span>
      </div>
      <div className="flex w-full justify-center" ref={hostRef} />
      {busy && (
        <p className="auth-note mt-[13px] text-center text-[0.68rem] leading-[1.5]" role="status">
          Signing in with Google…
        </p>
      )}
      {message && (
        <p className="auth-note mt-[13px] text-center text-[0.68rem] leading-[1.5]" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

export default GoogleSignInButton
