import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Start every browser launch signed out. Login remains available for the
// current session, but an old demo account cannot automatically reappear
// after restarting the frontend.
localStorage.removeItem('royalty-user')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)