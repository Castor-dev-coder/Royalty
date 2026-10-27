// GCash payment display helpers. Money is NEVER computed here: every amount
// rendered below comes straight from the server (quote options, totals,
// balances). Formatting is presentation only (peso sign + grouping).

export const PAYMENT_STATUS_LABELS = {
  UNVERIFIED: 'Awaiting verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
}

/**
 * Presentation of ONE server-supplied amount. Numbers get the app's peso
 * formatting (grouping + 2 decimals); any other value passes through verbatim
 * so a server-formatted string is never re-derived.
 */
export function formatAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `₱${String(value ?? '')}`
}

/** Reference number gate: required, at least 3 characters (trimmed). */
export function validateReferenceNo(value) {
  const reference = String(value ?? '').trim()
  if (reference === '') return 'Enter the GCash reference number.'
  if (reference.length < 3) return 'Reference number must be at least 3 characters.'
  return null
}

/**
 * What the payment dialog should show for a quote:
 *  - 'unconfigured' when online GCash payments are not configured yet
 *  - 'fully-paid'  when the server offers no options
 *  - 'ready'       when server options exist
 */
export function quoteViewState(quote) {
  if (!quote) return 'missing'
  if (quote.settings?.configured === false) return 'unconfigured'
  if (!Array.isArray(quote.options) || quote.options.length === 0) return 'fully-paid'
  return 'ready'
}

/**
 * Label for one server option, carrying the SERVER amount: 'FULL' renders
 * 'Pay in full — ₱X'; 'DOWN' names the server's down-payment policy (e.g.
 * 'Pay 40% down payment — ₱Y') and falls back to plain wording when the
 * policy has no percentage to name.
 */
export function optionLabel(option, settings) {
  const amount = formatAmount(option?.amount)
  if (option?.key === 'FULL') return `Pay in full — ${amount}`
  const kind = settings?.downPaymentKind
  const value = settings?.downPaymentValue
  if (kind === 'PERCENT' && typeof value === 'number' && value > 0) {
    return `Pay ${value}% down payment — ${amount}`
  }
  return `Pay down payment — ${amount}`
}

/** Quote summary rows — labels paired with the server's amounts, as sent. */
export function quoteSummaryRows(quote) {
  return [
    { key: 'total', label: 'Total', value: quote?.totalAmount },
    { key: 'verified', label: 'Verified received', value: quote?.verifiedTotal },
    { key: 'outstanding', label: 'Outstanding', value: quote?.outstanding },
  ].map((row) => ({ ...row, display: formatAmount(row.value) }))
}

/**
 * Whether the PAY WITH GCASH button appears on an appointment card.
 * Hidden for cancelled, no-show and fully paid; shown for pay-at-salon
 * bookings and anything unpaid or partly paid. Unknown outstanding (payment
 * rows still loading) keeps the button — the server quote gates the dialog.
 */
export function shouldShowPay(status, outstanding) {
  if (status === 'CANCELLED' || status === 'NO_SHOW') return false
  if (outstanding === null || outstanding === undefined) return true
  return Number(outstanding) > 0
}

/** The 'pay at the salon' closing line, quoting the server's outstanding. */
export function salonOptionMessage(quote) {
  return `Pay ${formatAmount(quote?.outstanding)} at the salon (cash or GCash).`
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] ?? status
}

/** Human message for a failed online payment submission (server first). */
export function paymentFailureMessage(error) {
  const message = String(error?.message ?? '').trim()
  return message || 'Could not submit your payment. Try again.'
}

/**
 * Groups a customer's transactions per appointment (server order kept). The
 * balance summary (total / verified received / outstanding) is copied from
 * the server rows — never recomputed.
 */
export function groupPaymentsByAppointment(payments) {
  const groups = new Map()
  for (const payment of payments ?? []) {
    const key = payment?.appointmentId ?? payment?.appointmentCode ?? `row-${groups.size}`
    if (!groups.has(key)) {
      groups.set(key, {
        appointmentId: payment?.appointmentId ?? null,
        appointmentCode: payment?.appointmentCode ?? '',
        appointmentTotal: payment?.appointmentTotal ?? null,
        verifiedTotal: payment?.verifiedTotal ?? null,
        outstanding: payment?.outstanding ?? null,
        transactions: [],
      })
    }
    groups.get(key).transactions.push(payment)
  }
  return [...groups.values()]
}
