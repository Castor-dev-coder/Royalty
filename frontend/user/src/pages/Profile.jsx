import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.jsx'
import { useToast } from '../context/useToast.jsx'

function Profile() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const { showToast } = useToast()
  const [saved, setSaved] = useState(false)

  const updateProfile = useCallback((event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextUser = { ...user, name: `${form.get('firstName')} ${form.get('lastName')}`.trim(), email: form.get('email') }
    localStorage.setItem('royalty-user', JSON.stringify(nextUser))
    login(nextUser)
    setSaved(true)
    showToast('success', 'Your profile has been updated.')
  }, [login, showToast, user])

  if (!user) return <Navigate to="/services" replace />

  return (
    <>
      <main className="min-h-[calc(100vh-76px)] bg-black py-16">
        <div className="mx-auto w-[min(100%-48px,980px)] max-[680px]:w-[min(100%-36px,980px)]">
          <div className="mb-10 text-center">
            <h1 className="m-0 font-(--serif) text-3xl text-(--gold)">Profile Information</h1>
            <p className="mt-2 text-sm text-[#918c82]">Manage your personal details</p>
          </div>
          <form onSubmit={updateProfile} className="rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-[680px]:p-6">
            <div className="mb-8 flex flex-col items-center border-b border-[rgba(212,180,92,0.15)] pb-8">
              <div className="grid size-25 place-items-center rounded-full border-2 border-(--gold) bg-[#1a1815] text-4xl font-medium text-(--gold)">{user.name?.[0]?.toUpperCase() || 'U'}</div>
              <p className="mt-4 font-(--serif) text-xl text-[#f4f1eb]">{user.name}</p>
              <p className="text-sm text-[#918c82]">{user.email}</p>
            </div>
            <div className="grid gap-6">
              <div className="grid grid-cols-2 gap-4 max-[680px]:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <label htmlFor="firstName" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">First Name</label>
                  <input id="firstName" name="firstName" defaultValue={user.name?.split(' ')[0]} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="lastName" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Last Name</label>
                  <input id="lastName" name="lastName" defaultValue={user.name?.split(' ').slice(1).join(' ')} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Email Address</label>
                <input id="email" name="email" type="email" defaultValue={user.email} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="phone" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Phone Number</label>
                <input id="phone" name="phone" type="tel" placeholder="+63 976 475 422" className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Security</label>
                <button type="button" onClick={() => navigate('/change-password')} className="flex w-fit items-center gap-2 rounded-md border border-[rgba(212,180,92,0.4)] bg-transparent px-5 py-3 text-sm text-(--gold) transition-colors hover:bg-[rgba(212,180,92,0.1)]">
                  <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  Change Password
                </button>
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-4 border-t border-[rgba(212,180,92,0.15)] pt-6">
              <button type="button" onClick={() => navigate(-1)} className="btn-pill rounded-full border border-[rgba(212,180,92,0.4)] px-6 py-3 text-sm text-[#918c82] transition-colors hover:border-[rgba(212,180,92,0.6)] hover:text-[#f4f1eb]">Cancel</button>
              <button type="submit" className="btn-pill rounded-full bg-(--gold) px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-(--gold-bright)">
                {saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}

export default Profile