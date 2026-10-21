import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import Navbar from '../components/Navbar.jsx'

const appointments = [
  { month: 'OCT', day: '10', service: 'Hair Coloring', detail: 'Saturday · 2:30 PM · Anna Reyes', price: '₱2,500', status: 'CONFIRMED', action: 'RESCHEDULE' },
  { month: 'OCT', day: '24', service: 'Classic Haircut', detail: 'Saturday · 11:00 AM · Anna Reyes', price: '₱800', status: 'COMPLETED', action: 'WRITE REVIEW' },
  { month: 'NOV', day: '07', service: 'Hair Treatment', detail: 'Saturday · 3:00 PM · Any available stylist', price: '₱1,200', status: 'PENDING', action: 'RESCHEDULE' },
]

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange && onChange(star)}
          className="text-2xl transition-transform hover:scale-110"
          style={{ color: star <= value ? 'var(--gold)' : '#4a4540' }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function Appointments() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('royalty-user')) } catch { return null }
  })

  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewRating, setReviewRating] = useState(5)

  function openReviewModal() {
    setReviewTitle('New salon experience')
    setReviewText('')
    setReviewRating(5)
    setShowReviewModal(true)
  }

  function submitReview() {
    if (!reviewTitle.trim() || !reviewText.trim()) return
    const savedReviews = JSON.parse(localStorage.getItem('royalty-reviews') || '[]')
    savedReviews.push({
      id: `review-${Date.now()}`,
      service: reviewTitle.trim(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      rating: reviewRating,
      stylist: 'Anna Reyes',
      text: reviewText.trim(),
    })
    localStorage.setItem('royalty-reviews', JSON.stringify(savedReviews))
    setShowReviewModal(false)
    navigate('/my-reviews')
  }

  if (!user) return <Navigate to="/services" replace />

  function logout() {
    localStorage.removeItem('royalty-user')
    setUser(null)
  }

  return (
    <div className="min-h-screen bg-black text-[#eeeae2]">
      <Navbar user={user} onLogout={logout} onLoginClick={() => navigate('/services')} />
      <main className="mx-auto w-[min(100%-82px,1200px)] py-[62px] max-[680px]:w-[min(100%-36px,1200px)] max-[680px]:py-10">
        <div className="mb-7 flex items-end justify-between gap-5">
          <div><h1 className="m-0 font-[var(--serif)] text-[28px] text-[var(--gold)]">Appointments</h1><p className="mt-1 text-[9px] uppercase tracking-wide text-[#918c82]">Your appointment overview</p></div>
          <button type="button" onClick={() => navigate('/services')} className="rounded border border-[var(--gold)] bg-[var(--gold)] px-8 py-3 text-[10px] font-bold text-black hover:bg-[var(--gold-bright)]">BOOK NEW</button>
        </div>
        <div className="mb-8 grid grid-cols-4 gap-3 max-[800px]:grid-cols-2 max-[500px]:grid-cols-1">
          {[['◫', '12', 'Total Appointments'], ['◷', '3', 'Upcoming'], ['☆', '7', 'Completed'], ['×', '2', 'Cancelled']].map(([icon, number, label]) => <div key={label} className="flex min-h-[64px] items-center gap-3 rounded-lg border border-[rgba(212,180,92,.45)] bg-[#111] px-3"><span className="grid size-9 place-items-center rounded-full border border-[var(--gold)] text-xl text-[var(--gold)]">{icon}</span><div><strong className="text-lg">{number}</strong><p className="m-0 text-[8px] text-[#918c82]">{label}</p></div></div>)}
        </div>
        <div className="mb-4 flex gap-7 border-b border-[#27241f] text-[10px]"><button className="border-b-2 border-[var(--gold)] px-1 pb-3 text-[var(--gold)]">Upcoming</button><button className="pb-3 text-[#918c82]">Past</button><button className="pb-3 text-[#918c82]">Cancelled</button></div>
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <article key={appointment.day} className="flex items-center gap-5 rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515] px-5 py-3 max-[800px]:flex-wrap">
              <div className="w-14 border-r border-[#38332b] text-center">
                <small className="text-[7px] text-[var(--gold)]">{appointment.month}</small>
                <div className="font-[var(--serif)] text-xl">{appointment.day}</div>
              </div>
              <div className="min-w-[180px] flex-1">
                <h2 className="m-0 font-[var(--serif)] text-lg">{appointment.service}</h2>
                <p className="m-1 text-[9px] text-[#918c82]">{appointment.detail}</p>
              </div>
              <strong className="text-sm text-[var(--gold)]">{appointment.price}</strong>
              <span className="rounded-full border border-[#6b5b2e] px-3 py-1 text-[7px] text-[#d7bd70]">{appointment.status}</span>
              {appointment.action === 'WRITE REVIEW' ? (
                <button type="button" onClick={openReviewModal} className="rounded border border-[#6b5b2e] px-4 py-2 text-[8px] text-[var(--gold)]">WRITE REVIEW</button>
              ) : (
                <button type="button" className="rounded border border-[#6b5b2e] px-4 py-2 text-[8px] text-[var(--gold)]">{appointment.action}</button>
              )}
              <button type="button" className="rounded border border-[#555] px-4 py-2 text-[8px] text-[#aaa49a]">CANCEL</button>
            </article>
          ))}
        </div>

        {showReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 sm:p-8">
            <div className="w-full max-w-[1120px] border border-[rgba(212,180,92,0.55)] bg-[#171816] px-8 py-8 sm:px-12 sm:py-9">
              <div className="flex items-start justify-between gap-6">
                <p className="m-0 text-[10px] font-semibold tracking-[0.32em] text-(--gold) uppercase">New review</p>
                <StarRating value={reviewRating} onChange={setReviewRating} />
              </div>

              <label htmlFor="review-title" className="sr-only">Review title</label>
              <input
                id="review-title"
                type="text"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                className="mt-7 w-full border-0 bg-transparent p-0 font-(--serif) text-3xl font-light italic text-[#f4f1eb] outline-none placeholder:text-[#f4f1eb] sm:text-4xl"
                placeholder="New salon experience"
              />

              <label htmlFor="review-text" className="mt-10 mb-4 block text-[10px] tracking-[0.24em] text-[#918c82] uppercase">Tell us about your visit</label>
              <textarea
                id="review-text"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="What did you love about your experience?"
                rows={5}
                className="w-full resize-y border border-[rgba(212,180,92,0.35)] bg-[#0d0d0c] px-5 py-5 text-base leading-relaxed text-[#f4f1eb] outline-none transition-colors placeholder:text-[#7f8994] focus:border-(--gold)"
              />

              <div className="mt-5 flex items-center justify-end gap-8">
                <button type="button" onClick={() => setShowReviewModal(false)} className="cursor-pointer text-[10px] font-semibold tracking-[0.2em] text-(--gold) uppercase hover:text-(--gold-bright)">Cancel</button>
                <button type="button" onClick={submitReview} className="cursor-pointer rounded-sm border border-(--gold) bg-(--gold) px-7 py-4 text-[10px] font-bold tracking-[0.12em] text-[#111] uppercase transition-colors hover:bg-(--gold-bright)">Save review</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer user={user} onLoginClick={() => navigate('/services')} />
    </div>
  )
}

export default Appointments
