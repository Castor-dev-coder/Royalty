import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './auth-context.js'
import {
  clearSession,
  displayNameFor,
  getSessionUser,
  hasAuthHint,
  lastRefreshOutcome,
  loginRequest,
  logoutRequest,
  registerRequest,
  setSession,
  tryRefresh,
} from '../lib/api.js'

function sessionUserFor(result) {
  return { id: result.id, email: result.email, role: result.role, name: displayNameFor(result.email) }
}

// Hybrid auth: the access token lives in memory only (see lib/api.js) and the
// refresh token is an httpOnly cookie. On load, a non-secret hint flag turns
// on silent restoration so returning users see a loading state — never a
// signed-out flash — while anonymous visitors skip the refresh entirely.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authView, setAuthView] = useState(null)
  const [restoring, setRestoring] = useState(() => hasAuthHint())

  // Silent restore: exchange the httpOnly refresh cookie for an access token.
  useEffect(() => {
    if (!hasAuthHint()) return undefined
    let cancelled = false
    void (async () => {
      const ok = await tryRefresh()
      if (cancelled) return
      if (ok) {
        setUser(getSessionUser())
      } else if (lastRefreshOutcome() === 'unauthorized') {
        // Invalid/expired cookie: drop the hint so later visits stay quiet.
        clearSession()
      }
      setRestoring(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email, password, rememberMe = false) => {
    const result = await loginRequest(email, password, rememberMe)
    const sessionUser = sessionUserFor(result)
    setSession({ user: sessionUser, accessToken: result.accessToken })
    setUser(sessionUser)
    return sessionUser
  }, [])

  const signUp = useCallback(async (payload) => {
    const result = await registerRequest(payload)
    const sessionUser = sessionUserFor(result)
    setSession({ user: sessionUser, accessToken: result.accessToken })
    setUser(sessionUser)
    return sessionUser
  }, [])

  // Legacy setter kept for AppShell's post-login toast: signIn/signUp already
  // stored the session, this only adopts the user object into state.
  const login = useCallback((nextUser) => {
    setUser(nextUser)
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest() // clears the httpOnly cookie and the in-memory session
    setUser(null)
    setAuthView(null)
  }, [])

  // FE-01 outcomes: 'clear' drops the session and opens sign-in; 'keep' does
  // nothing (the caller shows its own no-access or error state).
  const resolveAuthFailure = useCallback(async (disposition) => {
    if (disposition === 'clear') {
      clearSession()
      setUser(null)
      setAuthView('login')
    }
  }, [])

  const openAuth = useCallback((view) => setAuthView(view), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])

  const value = useMemo(
    () => ({ user, restoring, authView, signIn, signUp, login, logout, resolveAuthFailure, openAuth, closeAuth, switchAuth }),
    [user, restoring, authView, signIn, signUp, login, logout, resolveAuthFailure, openAuth, closeAuth, switchAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
