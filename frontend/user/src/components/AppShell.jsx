import { useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import OutageHost from './OutageHost.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import Footer from './Footer.jsx'
import Login from './Login.jsx'
import MobileBookCTA from './MobileBookCTA.jsx'
import Navbar from './Navbar.jsx'
import Signin from './Signin.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useToast } from '../context/useToast.jsx'

// Shared page chrome: sticky navbar, footer, auth dialogs, and the mobile
// booking action. Routes render their own content through <Outlet /> so the
// chrome stays mounted (and keeps working) across navigations and lazy loads.
function AppShell() {
  const { user, authView, login, logout, openAuth, closeAuth, switchAuth } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()

  const handleLogin = useCallback(
    (nextUser) => {
      login(nextUser)
      showToast(
        'success',
        authView === 'signin'
          ? `Welcome, ${nextUser.name}. Your account is ready.`
          : `Welcome back, ${nextUser.name}.`,
      )
    },
    [authView, login, showToast],
  )

  const handleLogout = useCallback(() => {
    logout()
    showToast('info', 'You have been signed out.')
  }, [logout, showToast])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onLoginClick={() => openAuth('login')}
        onLogout={handleLogout}
        user={user}
      />
      <OutageHost />
      <div>
        {/* Per-route boundary: keyed by pathname so navigation resets it. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </div>
      <Footer onLoginClick={() => openAuth('login')} user={user} />
      <MobileBookCTA />
      {authView === 'login' && (
        <Login onClose={closeAuth} onLogin={handleLogin} onSwitch={switchAuth} />
      )}
      {authView === 'signin' && (
        <Signin onClose={closeAuth} onLogin={handleLogin} onSwitch={switchAuth} />
      )}
    </div>
  )
}

export default AppShell
