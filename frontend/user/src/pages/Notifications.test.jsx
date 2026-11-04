// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mockAuth = vi.hoisted(() => ({
  current: { user: null, restoring: false, openAuth: vi.fn() },
}))
vi.mock('../context/useAuth.jsx', () => ({ useAuth: () => mockAuth.current }))
vi.mock('../lib/useOutage.js', () => ({ useRecoveryTick: () => 0 }))
vi.mock('../lib/useAutoRefresh.js', () => ({ useAutoRefresh: () => {} }))
vi.mock('../lib/api.js', () => ({
  NOT_MODIFIED: Symbol('NOT_MODIFIED'),
  fetchMyAppointments: vi.fn(),
}))
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

import Notifications from './Notifications.jsx'
import { fetchMyAppointments } from '../lib/api.js'

function appointmentRow(id, extra = {}) {
  return {
    id,
    status: 'CONFIRMED',
    appointmentDate: '2026-11-20',
    services: [{ serviceName: 'Hair Color' }],
    alreadyReviewed: false,
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Notifications page', () => {
  beforeEach(() => {
    mockAuth.current = {
      user: { name: 'QA', email: 'qa@example.com', role: 'CUSTOMER' },
      restoring: false,
      openAuth: vi.fn(),
    }
    fetchMyAppointments.mockResolvedValue({ appointments: [], total: 0 })
  })

  it('shows the sign-in prompt when signed out', () => {
    mockAuth.current = { user: null, restoring: false, openAuth: vi.fn() }
    render(<Notifications />)
    expect(
      screen.getByRole('heading', { name: 'Sign in to view your notifications' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }))
    expect(mockAuth.current.openAuth).toHaveBeenCalledWith(
      'login',
      'view your notifications',
    )
  })

  it('keeps the skeleton up while the session restores', () => {
    mockAuth.current = { ...mockAuth.current, restoring: true }
    render(<Notifications />)
    expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('renders real appointment updates and names the feed gap', async () => {
    fetchMyAppointments.mockResolvedValue({
      appointments: [appointmentRow(1), appointmentRow(2, { status: 'COMPLETED' })],
      total: 2,
    })
    render(<Notifications />)
    expect(await screen.findByText('Booking confirmed')).toBeTruthy()
    expect(screen.getByText('Appointment completed')).toBeTruthy()
    // Every row is a restatement of a real appointment row.
    expect(
      screen.getByText(/Your Hair Color appointment on Nov 20, 2026 is now booked\./),
    ).toBeTruthy()
    // The missing notifications endpoint is surfaced as a gap, not faked.
    expect(screen.getByText(/a dedicated notifications feed is a backend gap/)).toBeTruthy()
  })
})
