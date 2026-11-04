import { Link } from 'react-router-dom'
import SignInPanel from '../components/SignInPanel.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { useTheme } from '../context/useTheme.jsx'

function SettingRow({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[rgba(212,180,92,0.22)] bg-[#151515] px-5 py-4">
      <div className="min-w-0">
        <h2 className="m-0 text-[16px] font-semibold text-[#f6f2ea]">
          {title}
        </h2>
        <p className="m-0 mt-1 text-[13px] leading-[1.6] text-[#c0bbb2]">
          {description}
        </p>
      </div>
      {children}
    </div>
  )
}

function SettingLink({ to, label }) {
  return (
    <Link
      className="btn-pill inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[var(--gold)] bg-transparent px-[1.2rem] py-[0.7rem] text-(--text) no-underline hover:bg-[rgba(212,180,92,.14)]"
      to={to}
    >
      {label}
    </Link>
  )
}

// Account settings: client-side preferences and navigation to the existing
// account screens. Every control here is real (theme, routes into Profile /
// ChangePassword / MyReviews) — there is no settings endpoint, and nothing on
// this page pretends otherwise.
function Settings() {
  const { user, restoring } = useAuth()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <main className="min-h-[calc(100vh-76px)] bg-black">
      <section className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)] max-[680px]:py-[30px] max-[680px]:pb-[58px]">
        <div className="mb-8">
          <span className="type-section-eyebrow text-[var(--gold)]">
            YOUR ACCOUNT
          </span>
          <h1 className="m-0 mt-2 font-[var(--serif)] text-[34px] leading-tight text-[var(--gold)] max-[680px]:text-[28px]">
            Settings
          </h1>
          <p className="mt-1.5 text-[14px] text-[#c0bbb2]">
            Manage your preferences and account
          </p>
        </div>

        {restoring && (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
            <div className="h-[96px] animate-pulse rounded-lg border border-[rgba(212,180,92,.35)] bg-[#151515]" />
          </div>
        )}

        {!restoring && !user && <SignInPanel action="open your settings" />}

        {!restoring && user && (
          <div className="flex flex-col gap-3">
            <SettingRow
              description="Royalty looks best in gold on dark — or try the light linen theme."
              title="Appearance"
            >
              <div
                aria-label="Theme"
                className="flex shrink-0 rounded-full border border-[rgba(212,180,92,0.45)] p-1"
                role="group"
              >
                <button
                  aria-pressed={isDark}
                  className={`min-h-[36px] cursor-pointer rounded-full border-0 px-4 text-[12px] font-semibold tracking-[0.12em] uppercase transition-colors ${isDark ? 'bg-[var(--gold)] text-[#111]' : 'bg-transparent text-[#c0bbb2]'}`}
                  onClick={() => setTheme('dark')}
                  type="button"
                >
                  Dark
                </button>
                <button
                  aria-pressed={!isDark}
                  className={`min-h-[36px] cursor-pointer rounded-full border-0 px-4 text-[12px] font-semibold tracking-[0.12em] uppercase transition-colors ${!isDark ? 'bg-[var(--gold)] text-[#111]' : 'bg-transparent text-[#c0bbb2]'}`}
                  onClick={() => setTheme('light')}
                  type="button"
                >
                  Light
                </button>
              </div>
            </SettingRow>

            <SettingRow
              description={`Signed in as ${user.name} (${user.email}). Update your name and contact details.`}
              title="Profile"
            >
              <SettingLink label="EDIT PROFILE" to="/profile" />
            </SettingRow>

            <SettingRow
              description="Change the password for your Royalty account."
              title="Security"
            >
              <SettingLink label="CHANGE PASSWORD" to="/change-password" />
            </SettingRow>

            <SettingRow
              description="Read, edit, or remove the reviews you have written."
              title="My reviews"
            >
              <SettingLink label="MY REVIEWS" to="/my-reviews" />
            </SettingRow>
          </div>
        )}
      </section>
    </main>
  )
}

export default Settings
