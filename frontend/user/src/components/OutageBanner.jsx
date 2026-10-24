import { SALON_PHONE } from '../lib/salon.js'

// Slim banner used when public data is already on screen: the visitor keeps
// reading what loaded, and the automatic retry continues underneath.
function OutageBanner({ lastCheckedAt, checking, onRetry }) {
  return (
    <div
      className="border-b border-[rgba(212,180,92,0.45)] bg-[#1d1a12] px-5 py-3"
      role="alert"
    >
      <div className="mx-auto flex w-[min(100%,1180px)] flex-wrap items-center gap-x-3 gap-y-2 text-[13px] leading-relaxed text-[#e4e0d8]">
        <span className="font-semibold tracking-[0.12em] text-(--gold) uppercase">
          Connection lost
        </span>
        <span className="min-w-[200px] flex-1">
          We can&apos;t reach the salon server right now, so this may be out of
          date. We&apos;ll keep trying.
        </span>
        <button
          className="btn-pill cursor-pointer rounded-full border border-(--gold) px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] text-(--gold) uppercase hover:bg-(--gold) hover:text-[#15120b]"
          onClick={onRetry}
          type="button"
        >
          {checking ? 'Checking…' : 'Try again'}
        </button>
        <a className="text-[12px] text-(--gold) underline underline-offset-4 hover:text-(--gold-bright)" href={SALON_PHONE.href}>
          {SALON_PHONE.value}
        </a>
        {lastCheckedAt && (
          <span className="text-[11px] tracking-[0.14em] text-[#b3ada2] uppercase">
            Last checked{' '}
            {new Date(lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}

export default OutageBanner
