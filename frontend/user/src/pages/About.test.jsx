// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import About from './About.jsx'
import { resetOutageState } from '../lib/outage.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubTeam(body, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      expect(String(input)).toContain('/staff/team')
      return jsonResponse(status, body)
    }),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetOutageState()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('About — Meet Our Team', () => {
  it('renders members with initials placeholders and never shows contact details', async () => {
    stubTeam({
      data: {
        staff: [
          {
            id: 's1',
            firstName: 'Maria',
            lastName: 'Santos',
            photoUrl: null,
            position: 'Senior Stylist',
            bio: 'Twelve years behind the chair.',
            specialties: [{ id: 'c1', name: 'Balayage' }, { id: 'c2', name: 'Updos' }],
            coveredRoles: ['HAIR', 'NAILS'],
            email: 'maria@example.com',
            phone: '+63 917 555 0101',
          },
          {
            id: 's2',
            firstName: 'Jo',
            lastName: 'Cruz',
            photoUrl: '/images/team/jo.jpg',
            position: null,
            bio: null,
            specialties: [],
            coveredRoles: [],
          },
        ],
      },
    })
    render(<About />)
    await waitFor(() => expect(screen.getByText('Maria Santos')).toBeTruthy())
    // Initials placeholder circle when photoUrl is null.
    expect(screen.getByText('MS')).toBeTruthy()
    expect(screen.getByText('Senior Stylist')).toBeTruthy()
    expect(screen.getByText('Balayage · Updos')).toBeTruthy()
    expect(screen.getByText(/Covers HAIR · NAILS/)).toBeTruthy()
    expect(screen.getByText('Twelve years behind the chair.')).toBeTruthy()
    // Never render email or phone, even when the payload carries them.
    expect(screen.queryByText(/@/)).toBeNull()
    expect(screen.queryByText(/917/)).toBeNull()
    // A member with a photo renders the image instead of initials.
    expect(screen.getByAltText('Jo Cruz')).toBeTruthy()
  })

  it('shows the empty state when the roster is empty', async () => {
    stubTeam({ data: { staff: [] } })
    render(<About />)
    await waitFor(() => expect(screen.getByText('Our team profiles are not available yet.')).toBeTruthy())
  })

  it('shows the empty state when the roster cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch') }))
    render(<About />)
    await waitFor(() => expect(screen.getByText('Our team profiles are not available yet.')).toBeTruthy())
  })
})
