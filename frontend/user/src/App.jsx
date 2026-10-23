import { Routes, Route } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop.jsx'
import Homepage from './pages/Homepage.jsx'
import Reviews from './pages/Reviews.jsx'
import Services from './pages/Services.jsx'
import About from './pages/About.jsx'
import Appointments from './pages/Appointments.jsx'
import Profile from './pages/Profile.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import MyReviews from './pages/MyReviews.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

function App() {
  return (
    <ThemeProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/services" element={<Services />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/my-reviews" element={<MyReviews />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </ThemeProvider>
  )
}

export default App