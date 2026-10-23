import { useCallback, useMemo, useState } from 'react'
import { AuthContext } from './auth-context.js'

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('royalty-user'))
  } catch {
    return null
  }
}

// Shared customer session for the user frontend. Sign-in stays a local UI
// preview (see README): the session lives in localStorage only.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [authView, setAuthView] = useState(null)

  const login = useCallback((nextUser) => {
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('royalty-user')
    setUser(null)
    setAuthView(null)
  }, [])

  const openAuth = useCallback((view) => setAuthView(view), [])
  const closeAuth = useCallback(() => setAuthView(null), [])
  const switchAuth = useCallback(() => {
    setAuthView((view) => (view === 'login' ? 'signin' : 'login'))
  }, [])

  const value = useMemo(
    () => ({ user, authView, login, logout, openAuth, closeAuth, switchAuth }),
    [user, authView, login, logout, openAuth, closeAuth, switchAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
