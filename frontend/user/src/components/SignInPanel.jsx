import { useAuth } from '../context/useAuth.jsx'

// Unified gated-access prompt for signed-out visitors. Replaces bare
// redirects and dead-end locked actions with a polished "Sign in to [action]"
// panel that opens the existing auth dialogs. The action text is threaded
// into the dialog as its intent line, so every gate reads the same way.
function SignInPanel({ action = 'continue', standalone = false, children }) {
  const { openAuth } = useAuth()

  return (
    <section
      className={
        standalone
          ? 'mx-auto w-[min(100%-48px,1180px)] py-[58px] max-[600px]:w-[min(100%-36px,1180px)]'
          : 'w-full'
      }
    >
      <div className="flex flex-col items-start gap-4 rounded-[18px] border border-[rgba(212,180,92,0.35)] bg-[var(--card)] px-6 py-7 max-[680px]:px-5">
        <span className="type-section-eyebrow text-[var(--gold)]">
          MEMBERS ONLY
        </span>
        <h2 className="type-section-heading m-0 text-[#f6f2ea]">
          Sign in to {action}
        </h2>
        <p className="m-0 max-w-[52ch] text-[15px] leading-[1.65] text-[#c0bbb2]">
          This page belongs to your Royalty account. Sign in — or create a
          free account — to pick up right where you left off.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          <button
            className="btn-pill inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[#111] hover:bg-[var(--gold-bright)]"
            onClick={() => openAuth('login', action)}
            type="button"
          >
            SIGN IN
          </button>
          <button
            className="btn-pill inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-transparent px-[1.4rem] py-[0.8rem] text-(--text) hover:bg-[rgba(212,180,92,.14)]"
            onClick={() => openAuth('signin', action)}
            type="button"
          >
            CREATE ACCOUNT
          </button>
        </div>
        {children}
      </div>
    </section>
  )
}

export default SignInPanel
