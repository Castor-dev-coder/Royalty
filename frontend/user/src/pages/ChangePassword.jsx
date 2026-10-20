import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

function ChangePassword() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('royalty-user')) } catch { return null }
  })
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false })
  const [message, setMessage] = useState('')

  if (!user) return <Navigate to="/services" replace />

  function logout() {
    localStorage.removeItem('royalty-user')
    setUser(null)
  }

  function updatePassword(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if (values.next !== values.confirm) {
      setMessage('New passwords do not match.')
      return
    }
    setMessage('Password updated successfully.')
    event.currentTarget.reset()
  }

  const fields = [
    ['current', 'Current Password'],
    ['next', 'New Password'],
    ['confirm', 'Confirm Password'],
  ]

  return (
    <div className="min-h-screen bg-black text-[#eeeae2]">
      <Navbar user={user} onLogout={logout} onLoginClick={() => navigate('/services')} />
      <main className="flex justify-center px-5 py-16 max-[680px]:py-10">
        <form onSubmit={updatePassword} className="w-full max-w-[470px] rounded-[28px] bg-[#08080a] px-10 py-8 max-[520px]:px-5">
          <h1 className="m-0 text-center text-[22px] font-bold">Change Your Password</h1>
          <p className="mb-7 text-center text-xs text-[#aaa49a]">Update your account password</p>
          <div className="space-y-5">
            {fields.map(([name, label]) => (
              <label className="relative block text-sm" key={name}>
                {label}
                <input className="mt-2 w-full rounded-lg border border-[#514735] bg-[#24212b] px-4 py-3 text-sm outline-none placeholder:text-[#89858d] focus:border-[var(--gold)]" name={name} placeholder={label} required type={visible[name] ? 'text' : 'password'} />
                <button type="button" aria-label={`Show ${label}`} onClick={() => setVisible((state) => ({ ...state, [name]: !state[name] }))} className="absolute right-3 bottom-3 text-[#8d8994]">{visible[name] ? '◉' : '◌'}</button>
              </label>
            ))}
          </div>
          {message && <p className="mt-4 text-center text-xs text-[var(--gold)]">{message}</p>}
          <div className="mt-7 flex items-center justify-center gap-4">
            <button type="button" onClick={() => navigate('/profile')} className="rounded-full border border-[#514735] px-7 py-3 text-sm text-[#d7d1c7] hover:border-[var(--gold)] hover:text-[var(--gold)]">Back</button>
            <button className="flex rounded-full bg-[var(--gold)] px-8 py-3 font-bold text-black" type="submit">Update Password <span className="ml-3">→</span></button>
          </div>
          <button type="button" onClick={() => setMessage('Please contact the salon to reset your current password.')} className="mx-auto mt-3 block text-sm underline">Forgot Current Password?</button>
        </form>
      </main>
    </div>
  )
}

export default ChangePassword