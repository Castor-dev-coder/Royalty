import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import {
  ContentPageSkeleton,
  ReviewsPageSkeleton,
  ServicesPageSkeleton,
} from './components/PageSkeleton.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'
import GoogleOneTap from './components/GoogleOneTap.jsx'
import Homepage from './pages/Homepage.jsx'

// Inner routes load as separate chunks; while a chunk arrives, a page-shaped
// skeleton shows inside the shared chrome (navbar and footer stay mounted).
const Services = lazy(() => import('./pages/Services.jsx'))
const Appointments = lazy(() => import('./pages/Appointments.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'))
const MyReviews = lazy(() => import('./pages/MyReviews.jsx'))
const Reviews = lazy(() => import('./pages/Reviews.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Notifications = lazy(() => import('./pages/Notifications.jsx'))
const PaymentReturnPage = lazy(() => import('./pages/PaymentReturnPage.jsx'))
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions.jsx'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.jsx'))

function lazily(element, fallback) {
  return <Suspense fallback={fallback}>{element}</Suspense>
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ScrollToTop />
          <GoogleOneTap />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Homepage />} />
              <Route
                element={lazily(<Services />, <ServicesPageSkeleton />)}
                path="/services"
              />
              <Route
                element={lazily(<Appointments />, <ContentPageSkeleton />)}
                path="/appointments"
              />
              <Route
                element={lazily(<Profile />, <ContentPageSkeleton />)}
                path="/profile"
              />
              <Route
                element={lazily(<ChangePassword />, <ContentPageSkeleton />)}
                path="/change-password"
              />
              <Route
                element={lazily(<MyReviews />, <ContentPageSkeleton />)}
                path="/my-reviews"
              />
              <Route
                element={lazily(<Reviews />, <ReviewsPageSkeleton />)}
                path="/reviews"
              />
              <Route
                element={lazily(<About />, <ContentPageSkeleton />)}
                path="/about"
              />
              <Route
                element={lazily(<Settings />, <ContentPageSkeleton />)}
                path="/settings"
              />
              <Route
                element={lazily(<Notifications />, <ContentPageSkeleton />)}
                path="/notifications"
              />
              <Route
                element={lazily(<PaymentReturnPage />, <ContentPageSkeleton />)}
                path="/payment/return"
              />
              <Route
                element={lazily(<TermsAndConditions />, <ContentPageSkeleton />)}
                path="/terms"
              />
              <Route
                element={lazily(<PrivacyPolicy />, <ContentPageSkeleton />)}
                path="/privacy"
              />
              <Route
                element={lazily(<NotFound />, <ContentPageSkeleton />)}
                path="*"
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
