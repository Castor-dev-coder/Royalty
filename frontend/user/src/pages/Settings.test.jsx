// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mockAuth = vi.hoisted(() => ({
  current: { user: null, restoring: false, openAuth: vi.fn() },
}))
const mockTheme = vi.hoisted(() => ({
  current: { theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn() },
}))
vi.mock('../context/useAuth.jsx', () => ({ useAuth: () => mockAuth.current }))
vi.mock('../context/useTheme.jsx', () => ({ useTheme: () => mockTheme.current }))
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

import Settings from './Settings.jsx'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Settings page', () => {
  it('shows the sign-in prompt when signed out', () => {
    mockAuth.current = { user: null, restoring: false, openAuth: vi.fn() }
    render(<Settings />)
    expect(
      screen.getByRole('heading', { name: 'Sign in to open your settings' }),
    ).toBeTruthy()
  })

  it('offers real preference controls and account links when signed in', () => {
    mockAuth.current = {
      user: { name: 'QA', email: 'qa@example.com', role: 'CUSTOMER' },
      restoring: false,
      openAuth: vi.fn(),
    }
    mockTheme.current = { theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn() }
    render(<Settings />)
    // Segmented theme control reflects the current theme.
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(mockTheme.current.setTheme).toHaveBeenCalledWith('light')
    // Account rows link to the existing account screens.
    expect(screen.getByRole('link', { name: 'EDIT PROFILE' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CHANGE PASSWORD' }).getAttribute('href')).toBe('/change-password')
    expect(screen.getByRole('link', { name: 'MY REVIEWS' }).getAttribute('href')).toBe('/my-reviews')
  })
})
