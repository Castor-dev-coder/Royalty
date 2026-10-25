import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import CustomerInitials from '../components/CustomerInitials.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useRecoveryTick } from '../lib/useOutage.js'
import { useAutoRefresh } from '../lib/useAutoRefresh.js'
import { useToast } from '../context/useToast.jsx'
import { fetchMyCustomer, updateCustomer } from '../lib/api.js'

function Profile() {
  const navigate = useNavigate()
  const { user, restoring, login } = useAuth()
  // Refetches the page's data whenever an outage recovers.
  const recoveryTick = useRecoveryTick()
  const { showToast } = useToast()
  const [saved, setSaved] = useState(false)
  const [customer, setCustomer] = useState(null)
  // True while the customer is editing the form: background refreshes must
  // never overwrite what they are typing.
  const [dirty, setDirty] = useState(false)

  // Real profile: GET /customers/me fills the form.
  const load = useCallback(
    () =>
      fetchMyCustomer().then(
        (data) => {
          setCustomer(data ?? null)
          return true
        },
        // Keep the loaded form visible across a failed refetch; the outage
        // banner explains staleness.
        () => false,
      ),
    [],
  )

  useEffect(() => {
    void load()
  }, [load, recoveryTick])

  // Signed-in background refresh (focus / online / 45s ± jitter) — skipped
  // entirely while the form is dirty.
  useAutoRefresh(load, { enabled: Boolean(user) && user.role === 'CUSTOMER', paused: dirty })

  const updateProfile = useCallback((event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      firstName: String(form.get('firstName') ?? '').trim(),
      lastName: String(form.get('lastName') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
    }
    if (!customer?.id) return
    updateCustomer(customer.id, payload).then(
      () => {
        setSaved(true)
        setDirty(false)
        // The in-memory session keeps the display name in sync (no storage).
        login({ ...user, name: `${payload.firstName} ${payload.lastName}`.trim() || user.name })
        showToast('success', 'Your profile has been updated.')
      },
      (error) => {
        showToast('error', error?.message || 'Your profile could not be updated.')
      },
    )
  }, [customer, login, showToast, user])

  // Keep the skeleton up while the session restores — a redirect here would
  // bounce the visitor away from the profile they asked for.
  if (restoring) {
    return (
      <main className="min-h-[calc(100vh-76px)] bg-black py-16">
        <div className="mx-auto w-[min(100%-48px,980px)] max-[680px]:w-[min(100%-36px,980px)]">
          <div className="h-[420px] animate-pulse rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e]" />
        </div>
      </main>
    )
  }

  if (!user) return <Navigate to="/services" replace />

  return (
    <>
      <main className="min-h-[calc(100vh-76px)] bg-black py-16">
        <div className="mx-auto w-[min(100%-48px,980px)] max-[680px]:w-[min(100%-36px,980px)]">
          <div className="mb-10 text-center">
            <h1 className="m-0 font-(--serif) text-3xl text-(--gold)">Profile Information</h1>
            <p className="mt-2 text-sm text-[#918c82]">Manage your personal details</p>
          </div>
          {!customer ? (
            <div className="rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e] p-8 text-center text-sm text-[#b3ada2]" role="status">
              Loading your profile…
            </div>
          ) : (
          <form onSubmit={updateProfile} onInput={() => setDirty(true)} className="rounded-lg border border-[rgba(212,180,92,0.22)] bg-[#11100e] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-[680px]:p-6">
            <div className="mb-8 flex flex-col items-center border-b border-[rgba(212,180,92,0.15)] pb-8">
              {/* Customer identity is initials only — never a photo. */}
              <CustomerInitials className="size-25 text-4xl font-medium" name={`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || user.name} />
              <p className="mt-4 font-(--serif) text-xl text-[#f4f1eb]">{`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || user.name}</p>
              <p className="text-sm text-[#918c82]">{user.email}</p>
            </div>
            <div className="grid gap-6">
              <div className="grid grid-cols-2 gap-4 max-[680px]:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <label htmlFor="firstName" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">First Name</label>
                  <input id="firstName" name="firstName" defaultValue={customer.firstName} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="lastName" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Last Name</label>
                  <input id="lastName" name="lastName" defaultValue={customer.lastName} className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Email Address</label>
                <input id="email" name="email" type="email" defaultValue={user.email} disabled className="w-full rounded-md border border-[rgba(212,180,92,0.15)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#8d877c] outline-none" />
                <p className="m-0 text-[11px] text-[#8d877c]">Email changes are not supported yet.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="phone" className="text-xs font-medium uppercase tracking-wider text-[#918c82]">Phone Number</label>
                <input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? ''} placeholder="09XX XXX XXXX" required className="w-full rounded-md border border-[rgba(212,180,92,0.3)] bg-[#0d0d0c] px-4 py-3 text-sm text-[#f4f1eb] placeholder-[#5a5550] outline-none transition-colors focus:border-(--gold)" />
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
          )}
        </div>
      </main>
    </>
  )
}

export default Profile
