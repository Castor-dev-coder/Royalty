import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth.jsx'
import { useTheme } from '../context/useTheme.jsx'
import {
  ensureGoogleIdentity,
  googleSignInErrorMessage,
  renderGoogleButton,
  setGoogleCredentialHandler,
} from '../lib/googleAuth.js'

// 'Continue with Google' — a themed frame around Google's OWN rendered button
// (never redrawn or recolored). The frame carries the app's theme (black with
// a gold outline in dark mode, light surface with the darker light-mode gold
// in light mode) and Google's theme follows (filled_black / outline). When the
// app theme or the measured width changes, Google's button is re-rendered in
// place after dropping the old one: never a duplicate, and One Tap is never
// prompted from here. When GIS cannot load — no client id, blocked script, no
// browser support — the whole block hides and password login keeps working.
function GoogleSignInButton({ onSignedIn }) {
  const { signInWithGoogle } = useAuth()
  const { theme } = useTheme()
  const frameRef = useRef(null)
  const hostRef = useRef(null)
  // Callbacks move through refs so typing in the login form (parent state)
  // never tears down and re-renders the Google button.
  const onSignedInRef = useRef(onSignedIn)
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Width handed to Google's renderer: the frame's inner width, clamped 200–320.
  const [buttonWidth, setButtonWidth] = useState(null)

  useEffect(() => {
    onSignedInRef.current = onSignedIn
  }, [onSignedIn])

  // Credential handler is registered once; theme re-renders never touch it.
  useEffect(() => {
    const unregister = setGoogleCredentialHandler((idToken) => {
      setMessage('')
      setBusy(true)
      signInWithGoogle(idToken).then(
        (user) => {
          setBusy(false)
          onSignedInRef.current?.(user)
        },
        (error) => {
          setBusy(false)
          setMessage(googleSignInErrorMessage(error))
        },
      )
    })
    return () => unregister()
  }, [signInWithGoogle])

  // Measure the frame so Google's button always fits the column (200–320 px).
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined
    const measure = () => {
      const width = Math.round(Math.min(320, Math.max(200, frame.clientWidth - 8)))
      setButtonWidth((current) => (current === width ? current : width))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Render — and re-render — Google's button for the current theme and width.
  // replaceChildren() drops the previous button first: no duplicates, and the
  // swap happens in one pass so there is no flash of the wrong theme.
  useEffect(() => {
    if (buttonWidth === null) return undefined
    let cancelled = false
    ensureGoogleIdentity().then((ready) => {
      if (cancelled || !ready) return
      const host = hostRef.current
      if (!host) return
      host.replaceChildren()
      const rendered = renderGoogleButton(host, {
        type: 'standard',
        theme: theme === 'light' ? 'outline' : 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rect',
        width: buttonWidth,
      })
      if (rendered) setAvailable(true)
    })
    return () => {
      cancelled = true
    }
  }, [theme, buttonWidth])

  // Unmount cleanup: leave no Google iframe behind.
  useEffect(() => () => hostRef.current?.replaceChildren(), [])

  return (
    <div className={available ? 'w-full' : 'h-0 w-full overflow-hidden opacity-0 pointer-events-none'}>
      <div
        aria-hidden="true"
        className="relative my-[21px] w-full text-center text-[0.58rem] lowercase text-[var(--muted)] before:absolute before:top-1/2 before:right-0 before:left-0 before:h-px before:bg-[var(--line)] before:content-['']"
      >
        <span className="relative bg-[#11110f] px-3">or</span>
      </div>
      <div className="flex w-full justify-center">
        <div className="google-button-frame" ref={frameRef}>
          <div className="google-button-host" ref={hostRef} />
        </div>
      </div>
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
