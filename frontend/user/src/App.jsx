import { Routes, Route } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop.jsx'
import Homepage from './pages/Homepage.jsx'
import Reviews from './pages/Reviews.jsx'
import Services from './pages/Services.jsx'
import About from './pages/About.jsx'

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/services" element={<Services />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  )
}

export default App