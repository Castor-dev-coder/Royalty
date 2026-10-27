import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  groupPaymentsByAppointment,
  optionLabel,
  paymentFailureMessage,
  paymentStatusLabel,
  quoteSummaryRows,
  quoteViewState,
  salonOptionMessage,
  shouldShowPay,
  validateReferenceNo,
} from './payments.js'
import { ConflictError, NetworkError } from './api.js'

describe('shouldShowPay — when the card offers PAY WITH GCASH', () => {
  it('shows it for pay-at-salon bookings with nothing paid', () => {
    expect(shouldShowPay('RESERVED', 1000)).toBe(true)
    expect(shouldShowPay('CONFIRMED', 1000)).toBe(true)
    expect(shouldShowPay('COMPLETED', 250)).toBe(true) // partly paid
    expect(shouldShowPay('RESERVED', 0.01)).toBe(true) // one cent left
  })

  it('hides it for cancelled and no-show bookings', () => {
    expect(shouldShowPay('CANCELLED', 1000)).toBe(false)
    expect(shouldShowPay('NO_SHOW', 1000)).toBe(false)
  })

  it('hides it for fully paid bookings', () => {
    expect(shouldShowPay('RESERVED', 0)).toBe(false)
    expect(shouldShowPay('COMPLETED', 0)).toBe(false)
  })

  it('keeps it while the outstanding balance is not known yet', () => {
    expect(shouldShowPay('RESERVED', null)).toBe(true)
    expect(shouldShowPay('RESERVED', undefined)).toBe(true)
  })
})

describe('reference number validation', () => {
  it('requires a reference number', () => {
    expect(validateReferenceNo('')).toBe('Enter the GCash reference number.')
    expect(validateReferenceNo('   ')).toBe('Enter the GCash reference number.')
    expect(validateReferenceNo(null)).toBe('Enter the GCash reference number.')
  })

  it('requires at least 3 characters (after trimming)', () => {
    expect(validateReferenceNo('ab')).toBe('Reference number must be at least 3 characters.')
    expect(validateReferenceNo(' ab ')).toBe('Reference number must be at least 3 characters.')
    expect(validateReferenceNo('abc')).toBeNull()
    expect(validateReferenceNo(' 0123456789 ')).toBeNull()
  })
})

describe('quote rendering', () => {
  it('formats server amounts without computing money', () => {
    expect(formatAmount(1500)).toBe('₱1,500.00')
    expect(formatAmount(750.5)).toBe('₱750.50')
    // A server-formatted string passes through verbatim (peso sign only).
    expect(formatAmount('1,500.00')).toBe('₱1,500.00')
    expect(formatAmount('1500.00')).toBe('₱1500.00')
  })

  it('renders summary rows from the server values as sent', () => {
    const quote = { totalAmount: 3000, verifiedTotal: 1500, outstanding: 1500 }
    expect(quoteSummaryRows(quote)).toEqual([
      { key: 'total', label: 'Total', value: 3000, display: '₱3,000.00' },
      { key: 'verified', label: 'Verified received', value: 1500, display: '₱1,500.00' },
      { key: 'outstanding', label: 'Outstanding', value: 1500, display: '₱1,500.00' },
    ])
  })

  it('quotes the server outstanding in the pay-at-the-salon line', () => {
    expect(salonOptionMessage({ outstanding: 1500 })).toBe('Pay ₱1,500.00 at the salon (cash or GCash).')
  })

  it('labels payment statuses', () => {
    expect(paymentStatusLabel('UNVERIFIED')).toBe('Awaiting verification')
    expect(paymentStatusLabel('VERIFIED')).toBe('Verified')
    expect(paymentStatusLabel('REJECTED')).toBe('Rejected')
    expect(paymentStatusLabel('SOMETHING')).toBe('SOMETHING')
  })

  it('prefers the server message on failure', () => {
    expect(paymentFailureMessage(new ConflictError('An online payment for this appointment is already awaiting verification'))).toBe(
      'An online payment for this appointment is already awaiting verification',
    )
    expect(paymentFailureMessage(new NetworkError())).toBe('Cannot reach the server. Check your connection and try again.')
    expect(paymentFailureMessage(null)).toBe('Could not submit your payment. Try again.')
  })
})

describe('option gating', () => {
  const settings = { configured: true, downPaymentKind: 'PERCENT', downPaymentValue: 40 }

  it('shows unconfigured before anything else', () => {
    expect(quoteViewState({ settings: { configured: false }, options: [] })).toBe('unconfigured')
    expect(quoteViewState({ settings: { configured: false }, options: [{ key: 'FULL', amount: 1 }] })).toBe('unconfigured')
  })

  it('reports fully paid when the server offers no options', () => {
    expect(quoteViewState({ settings, options: [] })).toBe('fully-paid')
    expect(quoteViewState({ settings, options: undefined })).toBe('fully-paid')
  })

  it('is ready only when server options exist', () => {
    expect(quoteViewState({ settings, options: [{ key: 'FULL', amount: 3000 }] })).toBe('ready')
    expect(quoteViewState(null)).toBe('missing')
  })

  it('labels options with the server amounts', () => {
    expect(optionLabel({ key: 'FULL', amount: 3000 }, settings)).toBe('Pay in full — ₱3,000.00')
    expect(optionLabel({ key: 'DOWN', amount: 1500 }, settings)).toBe('Pay 40% down payment — ₱1,500.00')
    expect(optionLabel({ key: 'DOWN', amount: 500 }, { configured: true, downPaymentKind: 'FIXED', downPaymentValue: 500 })).toBe(
      'Pay down payment — ₱500.00',
    )
    expect(optionLabel({ key: 'DOWN', amount: 500 }, { configured: true, downPaymentKind: 'NONE', downPaymentValue: 0 })).toBe(
      'Pay down payment — ₱500.00',
    )
  })
})

describe('payment history grouping', () => {
  it('groups transactions per appointment and keeps server balances', () => {
    const payments = [
      { id: 'p2', appointmentId: 'a1', appointmentCode: 'RY-1', amount: 1500, appointmentTotal: 3000, verifiedTotal: 1500, outstanding: 1500 },
      { id: 'p1', appointmentId: 'a2', appointmentCode: 'RY-2', amount: 500, appointmentTotal: 500, verifiedTotal: 500, outstanding: 0 },
      { id: 'p3', appointmentId: 'a1', appointmentCode: 'RY-1', amount: 1500, appointmentTotal: 3000, verifiedTotal: 1500, outstanding: 1500 },
    ]
    const groups = groupPaymentsByAppointment(payments)
    expect(groups).toHaveLength(2)
    expect(groups[0].appointmentId).toBe('a1')
    expect(groups[0].transactions.map((payment) => payment.id)).toEqual(['p2', 'p3'])
    expect(groups[0].appointmentTotal).toBe(3000)
    expect(groups[0].outstanding).toBe(1500)
    expect(groups[1].appointmentCode).toBe('RY-2')
  })

  it('handles an empty list', () => {
    expect(groupPaymentsByAppointment([])).toEqual([])
    expect(groupPaymentsByAppointment(undefined)).toEqual([])
  })
})
