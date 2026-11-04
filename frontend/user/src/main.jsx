import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Start every browser launch signed out. Login remains available for the
// current session, but an old demo account cannot automatically reappear
// after restarting the frontend.
// One-time cleanup of legacy demo keys left behind by older builds
// (royalty-user, royalty-appointments, royalty-reviews, …). The only
// royalty-* key the app keeps is the non-secret auth hint.
for (const key of Object.keys(localStorage)) {
  if (key.startsWith('royalty-') && key !== 'royalty-auth-hint') localStorage.removeItem(key)
}

// Production only: the service worker serves the static outage page when a
// navigation fails because the network or the host is unreachable. It never
// registers in dev, so Vite's dev server and HMR stay untouched.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      /* the app works fine without the offline shell */
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)