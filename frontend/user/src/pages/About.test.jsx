// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import About from './About.jsx'
import { invalidatePublicCache } from '../lib/api.js'
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
  invalidatePublicCache()
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
    // Services are slash-separated tags (reference layout); the joined line
    // lives in one paragraph whose text is split across styled spans.
    expect(
      screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Balayage / Updos'),
    ).toBeTruthy()
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

  it('keeps the QA demo disclaimers visible for the fictional QA staff', async () => {
    stubTeam({
      data: {
        staff: [
          {
            id: 'q1',
            firstName: 'Camille',
            lastName: 'Rivera',
            photoUrl: '/images/team/camille.jpg',
            position: 'Senior Stylist',
            bio: 'Camille Rivera takes a calm, detail-first approach to precision cutting and wearable styling. QA demo profile — illustrative demonstration content, not a real employee.',
            specialties: [{ id: 'c1', name: 'Hair Cutting' }],
            coveredRoles: [],
          },
          {
            id: 'q2',
            firstName: 'Marco',
            lastName: 'Villanueva',
            photoUrl: '/images/team/marco.jpg',
            position: 'Hair Color Specialist',
            bio: 'Marco Villanueva focuses on color work, from subtle root touch-ups to full transformations. QA demo profile — illustrative demonstration content, not a real employee.',
            specialties: [{ id: 'c2', name: 'Hair Coloring' }],
            coveredRoles: [],
          },
        ],
      },
    })
    render(<About />)
    await waitFor(() => expect(screen.getByText('Camille Rivera')).toBeTruthy())
    expect(screen.getByText('Marco Villanueva')).toBeTruthy()
    // The disclaimer renders verbatim as its own visible note on both cards.
    expect(
      screen.getAllByText('QA demo profile — illustrative demonstration content, not a real employee.'),
    ).toHaveLength(2)
    // The bio text before the disclaimer still renders in full.
    expect(screen.getByText(/Camille Rivera takes a calm, detail-first approach/)).toBeTruthy()
    expect(screen.getByText(/Marco Villanueva focuses on color work/)).toBeTruthy()
  })
})
