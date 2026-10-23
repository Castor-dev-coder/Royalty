import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.jsx'

function ChangePassword() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false })
  const [message, setMessage] = useState('')

  const updatePassword = useCallback((event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if (values.next !== values.confirm) {
      setMessage('New passwords do not match.')
      return
    }
    setMessage('Password updated successfully.')
    event.currentTarget.reset()
  }, [])

  if (!user) return <Navigate to="/services" replace />

  const fields = [
    ['current', 'Current Password'],
    ['next', 'New Password'],
    ['confirm', 'Confirm Password'],
  ]

  return (
    <>
      <main className="min-h-[calc(100vh-76px)] bg-black py-16">
        <div className="mx-auto w-[min(100%-48px,470px)] max-[520px]:w-[min(100%-36px,470px)]">
          <form onSubmit={updatePassword} className="rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-[520px]:p-6">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 grid size-16 w-16 place-items-center rounded-full border-2 border-(--gold) bg-[#1a1815]">
                <svg className="size-8 text-(--gold)" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h1 className="m-0 font-(--serif) text-2xl text-(--gold)">Change Password</h1>
              <p className="mt-2 text-sm text-[#918c82]">Update your account security</p>
            </div>
            <div className="space-y-5">
              {fields.map(([name, label]) => (
                <div className="flex flex-col gap-2" key={name}>
                  <label htmlFor={name} className="text-xs font-medium uppercase tracking-wider text-[#918c82]">{label}</label>
                  <div className="relative">
                    <input id={name} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 pr-12 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" name={name} placeholder={label} required type={visible[name] ? 'text' : 'password'} />
                    <button type="button" aria-label={`Show ${label}`} onClick={() => setVisible((state) => ({ ...state, [name]: !state[name] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#918c82] transition-colors hover:text-(--gold)">
                      {visible[name] ? (
                        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      ) : (
                        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {message && <p aria-live="polite" className={`mt-4 rounded-md border px-4 py-3 text-center text-sm ${message.includes('success') ? 'border-[rgba(212,180,92,0.4)] bg-[rgba(212,180,92,0.1)] text-(--gold)' : 'border-red-900 bg-red-950/50 text-red-400'}`} role="status">{message}</p>}
            <div className="mt-7 flex items-center justify-center gap-4">
              <button type="button" onClick={() => navigate('/profile')} className="btn-pill rounded-full border border-[rgba(212,180,92,0.4)] px-6 py-3 text-sm text-[#918c82] transition-colors hover:border-[rgba(212,180,92,0.6)] hover:text-[#f4f1eb]">Cancel</button>
              <button className="btn-pill rounded-full bg-(--gold) px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-(--gold-bright)" type="submit">Update Password</button>
            </div>
            <button type="button" onClick={() => setMessage('Please contact the salon to reset your current password.')} className="mx-auto mt-4 block text-sm text-[#918c82] underline transition-colors hover:text-(--gold)">Forgot Current Password?</button>
          </form>
        </div>
      </main>
    </>
  )
}

export default ChangePassword
