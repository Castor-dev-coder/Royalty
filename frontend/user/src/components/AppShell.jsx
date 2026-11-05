import { useCallback, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Dialog from './Dialog.jsx'
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
  const { user, authView, authIntent, login, logout, openAuth, closeAuth, switchAuth } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogin = useCallback(
    (nextUser) => {
      login(nextUser)
      showToast(
        'success',
        authView === 'signin'
          ? `Welcome, ${nextUser.name}. Your account is ready.`
          : `Welcome back, ${nextUser.name}.`,
      )
      // Every new sign-in lands on Services (password and Google alike).
      // Session restoration never passes through here, so refreshing the page
      // keeps the current route.
      navigate('/services')
    },
    [authView, login, navigate, showToast],
  )

  // Signing out is destructive (drops the session), so it asks for
  // confirmation first and lands the user on Home once confirmed.
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  const handleLogout = useCallback(() => {
    setConfirmingSignOut(true)
  }, [])

  const confirmSignOut = useCallback(async () => {
    setConfirmingSignOut(false)
    await logout()
    showToast('info', 'You have been signed out.')
    navigate('/')
  }, [logout, navigate, showToast])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onLoginClick={() => openAuth('login')}
        onLogout={handleLogout}
        user={user}
      />
      <OutageHost />
      {/* Keyed wrapper replays the page entrance on every navigation. */}
      <div className="page-enter" key={location.pathname}>
        {/* Per-route boundary: keyed by pathname so navigation resets it. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </div>
      <Footer onLoginClick={() => openAuth('login')} user={user} />
      <MobileBookCTA />
      {authView === 'login' && (
        <Login intent={authIntent} onClose={closeAuth} onLogin={handleLogin} onSwitch={switchAuth} />
      )}
      {authView === 'signin' && (
        <Signin intent={authIntent} onClose={closeAuth} onLogin={handleLogin} onSwitch={switchAuth} />
      )}
      {confirmingSignOut && (
        <Dialog
          backdropClassName="bg-[rgba(0,0,0,0.78)] p-6 backdrop-blur-[5px] max-[680px]:p-3"
          labelledBy="signout-title"
          onClose={() => setConfirmingSignOut(false)}
          panelClassName="relative w-[min(100%,430px)] rounded-[9px] border border-[rgba(212,180,92,0.22)] bg-[linear-gradient(145deg,#14130f,#0d0d0c_70%)] px-8 py-9 text-center shadow-[0_30px_110px_rgba(0,0,0,0.75)]"
        >
          <h2 className="m-0 font-(--serif) text-2xl text-[#f3eee5]" id="signout-title">
            Sign out?
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[0.85rem] leading-[1.6] text-[#bbb6ad]">
            Are you sure you want to sign out? You&apos;ll need to sign in again to see your
            appointments.
          </p>
          <div className="mt-7 flex gap-3">
            <button
              className="btn-pill min-h-[44px] flex-1 cursor-pointer rounded-full border border-[rgba(212,180,92,0.45)] px-5 text-[0.88rem] font-bold uppercase tracking-[0.12em] text-[#d5cdbf] transition-[background-color] duration-[180ms] hover:bg-[rgba(212,180,92,0.12)]"
              onClick={() => setConfirmingSignOut(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn-pill min-h-[44px] flex-1 cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-5 text-[0.88rem] font-bold uppercase tracking-[0.12em] text-[#111] transition-[background-color] duration-[180ms] hover:bg-[var(--gold-bright)]"
              onClick={confirmSignOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export default AppShell
