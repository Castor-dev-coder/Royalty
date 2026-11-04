// The Maya redirect target. The browser lands here from the sandbox checkout
// (success, failure or cancel) — the payment state shown here NEVER comes
// from the redirect: every read is a server-side re-verification against the
// Maya API, and a still-pending payment is polled until it settles or the
// one-minute window closes with a clear "we're still confirming" message.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchMayaReturn, createMayaCheckout } from '../lib/api.js'
import { holdCountdownText, makeAttemptToken, paymentBadge } from '../lib/payments.js'

const POLL_MS = 2500
const GIVE_UP_MS = 60 * 1000

function peso(amount) {
  return `PHP ${Number(amount ?? 0).toFixed(2)}`
}

function PaymentReturnPage() {
  const [params] = useSearchParams()
  const paymentId = params.get('payment') ?? ''
  const attemptToken = params.get('attempt') ?? ''
  // Display-only hint from the redirect URL; the server state always wins.
  const outcomeHint = params.get('outcome') ?? ''
  const [view, setView] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stillConfirming, setStillConfirming] = useState(false)
  const [error, setError] = useState('')
  const [holdSeconds, setHoldSeconds] = useState(null)
  const [retrying, setRetrying] = useState(false)
  // Set on first poll (effects may read the clock; render may not).
  const startedAtRef = useRef(null)

  const load = useCallback(async () => {
    if (!paymentId || !attemptToken) {
      setError('This payment link is incomplete.')
      setLoading(false)
      return null
    }
    const data = await fetchMayaReturn(paymentId, attemptToken)
    const payment = data?.payment ?? null
    setView(payment)
    setOutcome(data?.outcome ?? null)
    setHoldSeconds(payment?.holdSecondsRemaining ?? null)
    setLoading(false)
    return data
  }, [paymentId, attemptToken])

  useEffect(() => {
    let cancelled = false
    let timer = null
    const tick = async () => {
      try {
        if (startedAtRef.current === null) startedAtRef.current = Date.now()
        const data = await load()
        if (cancelled) return
        const state = data?.outcome ?? data?.payment?.status
        if (state === 'PENDING' || state === 'MISMATCH') {
          if (Date.now() - startedAtRef.current >= GIVE_UP_MS) {
            setStillConfirming(true)
            return
          }
          timer = setTimeout(tick, POLL_MS)
        }
      } catch {
        if (!cancelled) {
          setError('We could not confirm the payment yet. Check your appointment status.')
          setLoading(false)
        }
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  // The hold countdown ticks while the payment is pending.
  useEffect(() => {
    if (!view || view.status !== 'PENDING') return undefined
    const timer = setInterval(() => {
      setHoldSeconds((value) => (value === null ? null : Math.max(0, value - 1)))
    }, 1000)
    return () => clearInterval(timer)
  }, [view])

  async function retryPayment() {
    if (!view?.appointmentId) return
    setRetrying(true)
    // A still-pending attempt resumes with its own token (idempotent); a
    // terminal attempt needs a fresh token to start a new one.
    const token = view.status === 'PENDING' ? attemptToken : makeAttemptToken()
    try {
      const data = await createMayaCheckout({
        appointmentId: view.appointmentId,
        plan: view.plan === 'DOWN' ? 'DOWN' : 'FULL',
        attemptToken: token,
      })
      const payment = data?.payment ?? data ?? {}
      if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl)
    } catch {
      setError('Payment could not be started. Check your appointment status.')
    } finally {
      setRetrying(false)
    }
  }

  const badge = view ? paymentBadge(view) : null
  const paid = view?.status === 'PAID'
  // A cancel-redirected attempt the server has since finalized reads
  // FAILED — it was abandoned, not declined, so the copy says so.
  const cancelled = outcomeHint === 'cancel' && !paid && (view?.status === 'PENDING' || view?.status === 'FAILED' || !view)
  // One story per screen: an abandoned attempt is 'cancelled', never
  // 'failed', in the headline AND the badge.
  const badgeText = cancelled ? 'Payment cancelled' : badge?.text

  let headline = 'Confirming your payment…'
  let message = 'We are confirming your payment with Maya. This usually takes a few seconds.'
  if (paid) {
    headline = 'Booked'
    if (Number(view?.outstanding ?? 0) <= 0) {
      message = 'Paid in full. Your appointment is confirmed.'
    } else {
      message = `Down payment paid: ${peso(view?.paidTotal)}, balance ${peso(view?.outstanding)} due at the salon.`
    }
  } else if (cancelled) {
    headline = 'Payment cancelled'
    message = 'Payment cancelled. Check your appointment status.'
  } else if (view?.status === 'FAILED') {
    headline = 'Payment failed'
    message = 'The payment did not go through. You can start a new payment from your appointments.'
  } else if (view?.status === 'EXPIRED') {
    headline = 'Payment expired'
    message = 'The payment window closed before the payment completed. You can start a new payment from your appointments.'
  } else if (view?.status === 'REJECTED') {
    headline = 'Payment rejected'
    message = 'The payment was not accepted. Check your appointment status.'
  } else if (stillConfirming || outcome === 'MISMATCH') {
    headline = "We're still confirming"
    message = "We're still confirming your payment. Check your Appointments page in a minute."
  } else if (view?.status === 'PENDING') {
    headline = 'Awaiting payment'
    message = 'Your slot is held while you complete the payment.'
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-14 text-center">
      <h1 className="font-(--serif) text-3xl text-(--gold)">{headline}</h1>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#bbb6ad]" role="status">{message}</p>
      {error && <p className="mx-auto mt-3 max-w-sm text-xs text-[#e9a68c]" role="alert">{error}</p>}
      {!paid && view?.status === 'PENDING' && holdSeconds !== null && (
        <p className="mx-auto mt-2 text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
          {holdCountdownText(holdSeconds)}
        </p>
      )}
      {badge && (
        <p className="mx-auto mt-3 inline-block rounded-full border border-[rgba(212,180,92,.4)] px-4 py-1 text-[11px] tracking-[1.2px] text-(--gold) uppercase">
          {badgeText}
        </p>
      )}
      {view?.appointmentCode && (
        <p className="mx-auto mt-3 text-[11px] leading-5 tracking-[1.2px] text-[#8d877c] uppercase">
          Reference: {view.appointmentCode}
        </p>
      )}
      {loading && <p className="mt-4 text-xs text-[#8d877c]">Checking payment status…</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!paid && (view?.status === 'FAILED' || view?.status === 'EXPIRED' || cancelled) && (
          <button
            type="button"
            onClick={retryPayment}
            disabled={retrying}
            className="btn-pill border border-(--gold) bg-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111] disabled:cursor-default disabled:opacity-60"
          >
            {retrying ? 'Starting payment…' : 'Open payment window'}
          </button>
        )}
        <Link
          to="/appointments"
          className="btn-pill border border-(--gold) px-7 py-3 text-xs font-bold uppercase tracking-wider text-(--gold)"
        >
          My appointments
        </Link>
      </div>
    </div>
  )
}

export default PaymentReturnPage
