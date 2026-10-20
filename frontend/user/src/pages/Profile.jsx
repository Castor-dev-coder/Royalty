import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

function Profile() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('royalty-user')) } catch { return null }
  })
  const [saved, setSaved] = useState(false)

  if (!user) return <Navigate to="/services" replace />

  function logout() {
    localStorage.removeItem('royalty-user')
    setUser(null)
  }

  function updateProfile(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextUser = { ...user, name: `${form.get('firstName')} ${form.get('lastName')}`.trim(), email: form.get('email') }
    localStorage.setItem('royalty-user', JSON.stringify(nextUser))
    setUser(nextUser)
    setSaved(true)
  }

  return (
    <div className="min-h-screen bg-black text-[#eeeae2]">
      <Navbar user={user} onLogout={logout} onLoginClick={() => navigate('/services')} />
      <main className="mx-auto flex w-[min(100%-48px,980px)] justify-center py-16 max-[680px]:w-[min(100%-36px,980px)] max-[680px]:py-10">
        <form onSubmit={updateProfile} className="grid w-full max-w-[900px] grid-cols-[120px_1fr] gap-x-12 rounded-b-xl border-t border-[var(--gold)] bg-black px-12 py-8 max-[680px]:grid-cols-1 max-[680px]:gap-6 max-[680px]:px-5">
          <div className="grid size-[88px] place-items-center self-start rounded-full bg-[#d8d8d8] text-4xl text-[#333]">{user.name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <h1 className="m-0 mb-6 text-xl font-semibold text-[#f4f1eb]">Profile Information</h1>
            <div className="grid grid-cols-2 gap-3 max-[680px]:grid-cols-1">
              <label className="text-[9px]">First Name<input name="firstName" defaultValue={user.name?.split(' ')[0]} className="mt-1 w-full rounded border border-[#514735] bg-[#24212b] px-2 py-2 text-xs outline-none focus:border-[var(--gold)]" /></label>
              <label className="text-[9px]">Last Name<input name="lastName" defaultValue={user.name?.split(' ').slice(1).join(' ')} className="mt-1 w-full rounded border border-[#514735] bg-[#24212b] px-2 py-2 text-xs outline-none focus:border-[var(--gold)]" /></label>
            </div>
            <label className="mt-4 block text-[9px]">Email<input name="email" type="email" defaultValue={user.email} className="mt-1 w-full rounded border border-[#514735] bg-[#24212b] px-2 py-2 text-xs outline-none focus:border-[var(--gold)]" /></label>
            <label className="mt-4 block text-[9px]">Phone<input name="phone" placeholder="+63 976475422" className="mt-1 w-full rounded border border-[#514735] bg-[#24212b] px-2 py-2 text-xs outline-none focus:border-[var(--gold)]" /></label>
            <div className="mt-4">
              <button type="button" onClick={() => navigate('/change-password')} className="text-left text-[9px] text-[#eeeae2] underline underline-offset-2">Change Password ↗</button>
              <input
                aria-label="Change Password"
                className="mt-1 block w-[155px] rounded border border-[#514735] bg-[#24212b] px-2 py-2 text-xs outline-none focus:border-[var(--gold)] max-[680px]:w-full"
                onFocus={() => navigate('/change-password')}
                placeholder=""
                readOnly
                type="password"
              />
            </div>
            <div className="mt-8 flex justify-end gap-3"><button type="button" onClick={() => navigate(-1)} className="rounded px-6 py-2 text-xs text-[#aaa49a]">Cancel</button><button type="submit" className="rounded-full bg-[var(--gold)] px-8 py-2 text-xs font-bold text-black">{saved ? 'Saved' : 'Done'}</button></div>
          </div>
        </form>
      </main>
    </div>
  )
}

export default Profile