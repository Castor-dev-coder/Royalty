// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetchPaymentQuote, submitOnlinePayment } from '../lib/api.js'
import GCashPaymentDialog from './GCashPaymentDialog.jsx'
import { ToastProvider } from './ToastProvider.jsx'

vi.mock('../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPaymentQuote: vi.fn(),
    submitOnlinePayment: vi.fn(),
  }
})

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

function quoteWith(overrides = {}) {
  return {
    appointmentId: 'a1',
    totalAmount: 3000,
    verifiedTotal: 1500,
    outstanding: 1500,
    options: [
      { key: 'FULL', amount: 3000 },
      { key: 'DOWN', amount: 1500 },
    ],
    settings: {
      configured: true,
      gcashQrUrl: 'https://cdn.example.com/qr.png',
      receiverName: 'Royalty Salon',
      accountNumberMasked: 'GCash •••• 1234',
      downPaymentKind: 'PERCENT',
      downPaymentValue: 40,
    },
    ...overrides,
  }
}

function renderDialog(overrides = {}) {
  return render(
    <ToastProvider>
      <GCashPaymentDialog item={{ id: 'a1', appointmentCode: 'RY-123' }} onClose={vi.fn()} onSubmitted={vi.fn()} {...overrides} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  fetchPaymentQuote.mockReset()
  submitOnlinePayment.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:proof')
  URL.revokeObjectURL = vi.fn()
})

afterEach(cleanup)

describe('GCashPaymentDialog quote rendering', () => {
  it('shows the server quote values, QR, and server-labelled options', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith() })
    renderDialog()
    await screen.findByText('Pay in full — ₱3,000.00')
    // Summary rows carry the server amounts as sent.
    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('Verified received')).toBeTruthy()
    expect(screen.getByText('Outstanding')).toBeTruthy()
    expect(screen.getAllByText('₱1,500.00').length).toBeGreaterThanOrEqual(2)
    // QR (lazy image) plus receiver details.
    const qr = screen.getByAltText('GCash QR code')
    expect(qr.getAttribute('src')).toBe('https://cdn.example.com/qr.png')
    expect(qr.getAttribute('loading')).toBe('lazy')
    expect(screen.getByText('Royalty Salon')).toBeTruthy()
    expect(screen.getByText('GCash •••• 1234')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pay 40% down payment — ₱1,500.00' })).toBeTruthy()
  })

  it('shows the unconfigured empty state', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith({ settings: { configured: false } }) })
    renderDialog()
    await screen.findByText('Online GCash payments are not configured yet.')
    expect(screen.queryByText('Pay in full — ₱3,000.00')).toBeNull()
  })

  it('shows the fully-paid state when the server offers no options', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith({ options: [] }) })
    renderDialog()
    await screen.findByText('This appointment is fully paid.')
  })

  it('keeps the server message and offers a retry when the quote fails', async () => {
    fetchPaymentQuote.mockRejectedValueOnce(new Error('relation "public.payment_settings" does not exist'))
    fetchPaymentQuote.mockResolvedValueOnce({ quote: quoteWith() })
    renderDialog()
    await screen.findByText('Could not load payment details.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Pay in full — ₱3,000.00')
    expect(fetchPaymentQuote).toHaveBeenCalledTimes(2)
  })
})

describe('GCashPaymentDialog form validation', () => {
  it('blocks an empty submit without any network call', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith() })
    renderDialog()
    await screen.findByText('Pay in full — ₱3,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT PAYMENT' }))
    expect(await screen.findByText('Enter the GCash reference number.')).toBeTruthy()
    expect(screen.getByText('Add your payment proof (PNG or JPG screenshot).')).toBeTruthy()
    expect(screen.getByText('Choose how much you want to pay.')).toBeTruthy()
    expect(submitOnlinePayment).not.toHaveBeenCalled()
  })

  it('requires a reference of at least 3 characters', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith() })
    renderDialog()
    await screen.findByText('Pay in full — ₱3,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Pay in full — ₱3,000.00' }))
    fireEvent.change(screen.getByLabelText('GCash reference number'), { target: { value: 'ab' } })
    fireEvent.change(screen.getByLabelText('Add payment proof'), {
      target: { files: [new File([PNG_BYTES], 'proof.png', { type: 'image/png' })] },
    })
    await screen.findByAltText('Payment proof preview')
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT PAYMENT' }))
    expect(await screen.findByText('Reference number must be at least 3 characters.')).toBeTruthy()
    expect(submitOnlinePayment).not.toHaveBeenCalled()
  })

  it('rejects a non-image proof by magic bytes', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith() })
    renderDialog()
    await screen.findByText('Pay in full — ₱3,000.00')
    fireEvent.change(screen.getByLabelText('Add payment proof'), {
      target: { files: [new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'fake.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('Photos must be PNG or JPG images.')).toBeTruthy()
  })
})

describe('GCashPaymentDialog pay-at-salon option', () => {
  it('closes with the server outstanding quoted', async () => {
    fetchPaymentQuote.mockResolvedValue({ quote: quoteWith() })
    const onClose = vi.fn()
    renderDialog({ onClose })
    await screen.findByText('Pay in full — ₱3,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Pay at the salon' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(submitOnlinePayment).not.toHaveBeenCalled()
  })
})
