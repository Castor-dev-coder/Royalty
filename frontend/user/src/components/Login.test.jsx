// @vitest-environment jsdom
// Loading-state contract for the customer sign-in button: the brand
// background and text contrast stay untouched while in flight (no faded or
// greyed button), the spinner + live label carry the state, dimensions stay
// fixed, duplicate submissions are impossible, and failures keep the form.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }))
vi.mock('../context/useAuth.jsx', () => ({ useAuth: () => ({ signIn: signInMock }) }))

import Login from './Login.jsx'
import { AuthError } from '../lib/api.js'
import { ThemeProvider } from '../context/ThemeContext.jsx'

function renderLogin() {
  return render(
    <ThemeProvider>
      <Login onClose={() => {}} onSwitch={() => {}} />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  // jsdom gaps used by the modal's Google button and layout measuring.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
})

afterEach(() => {
  cleanup()
  signInMock.mockReset()
  vi.unstubAllGlobals()
})

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'qa@example.com' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: /log in/i }))
}

describe('Login button loading state', () => {
  it('shows the spinner and a live label without fading the brand button', async () => {
    const pending = deferred()
    signInMock.mockReturnValue(pending.promise)
    renderLogin()
    fillAndSubmit()

    const button = screen.getByRole('button', { name: /signing in/i })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    // No faded/greyed-out treatment: the opacity fade must not come back.
    expect(button.className).not.toMatch(/opacity/)
    expect(button.className).not.toMatch(/brightness|filter/)
    // The spinner is decorative; the label carries the accessible meaning.
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy()

    pending.resolve({ id: '1', email: 'qa@example.com', role: 'CUSTOMER' })
    await pending.promise
  })

  it('cannot be submitted twice while a request is in flight', () => {
    const pending = deferred()
    signInMock.mockReturnValue(pending.promise)
    renderLogin()
    fillAndSubmit()
    fireEvent.click(screen.getByRole('button', { name: /signing in/i }))
    fireEvent.click(screen.getByRole('button', { name: /signing in/i }))
    expect(signInMock).toHaveBeenCalledTimes(1)
  })

  it('passes Remember me through to the session', () => {
    signInMock.mockResolvedValue({ id: '1', email: 'qa@example.com', role: 'CUSTOMER' })
    renderLogin()
    fireEvent.click(screen.getByLabelText(/keep me logged in/i))
    fillAndSubmit()
    expect(signInMock).toHaveBeenCalledWith('qa@example.com', 'secret123', true)
  })

  it('omits Remember me when the box is left unchecked', () => {
    signInMock.mockResolvedValue({ id: '1', email: 'qa@example.com', role: 'CUSTOMER' })
    renderLogin()
    fillAndSubmit()
    expect(signInMock).toHaveBeenCalledWith('qa@example.com', 'secret123', false)
  })

  it('keeps the form values and shows an accessible error on failure', async () => {
    signInMock.mockRejectedValue(new AuthError('unauthenticated', 401, 'UNAUTHORIZED', 'Nope'))
    renderLogin()
    fillAndSubmit()
    const alert = await screen.findByRole('status')
    expect(alert.textContent).toMatch(/email or password/i)
    expect(screen.getByLabelText(/email address/i).value).toBe('qa@example.com')
    expect(screen.getByLabelText(/^password$/i).value).toBe('secret123')
    await expect(screen.findByRole('button', { name: /log in/i })).resolves.toBeTruthy()
  })
})
