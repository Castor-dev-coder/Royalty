// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../context/useAuth.jsx', () => ({
  useAuth: () => ({ user: null, openAuth: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

import Reviews from './Reviews.jsx'
import { invalidatePublicCache } from '../lib/api.js'
import { resetOutageState } from '../lib/outage.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// GET /reviews row shape: the display model is overallRating ?? rating.
function reviewRow(id, overallRating, extra = {}) {
  return {
    id,
    createdAt: '2026-10-01T10:00:00Z',
    overallRating,
    rating: Math.round(overallRating),
    comment: `Comment ${id}`,
    photos: [],
    appointment: { services: [{ serviceName: 'Haircut' }] },
    ...extra,
  }
}

// The list is paginated (3 per page); the stub serves one row set per page.
function stubReviews(pages, total) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = String(input)
      expect(url).toContain('/reviews')
      const page = Number(new URL(url, 'http://local').searchParams.get('page') ?? '1')
      return jsonResponse(200, { data: { reviews: pages[page] ?? [], total } })
    }),
  )
}

function barWidth(name) {
  return screen.getByRole('img', { name }).firstElementChild.style.width
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

describe('Reviews — rating distribution', () => {
  it('aggregates the loaded rows into the distribution with an honest scope label', async () => {
    stubReviews({ 1: [reviewRow('r1', 5), reviewRow('r2', 5), reviewRow('r3', 4)] }, 10)
    render(<Reviews />)
    await waitFor(() => expect(screen.getByRole('img', { name: '5 stars: 2 reviews, 67%' })).toBeTruthy())
    expect(screen.getByRole('img', { name: '4 stars: 1 review, 33%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '3 stars: 0 reviews, 0%' })).toBeTruthy()
    // Average of the loaded rows (5+5+4)/3 = 4.7, and the scope says the
    // chart covers the 3 loaded reviews, never the 10 on the server.
    expect(screen.getByText('4.7')).toBeTruthy()
    expect(screen.getByText('Average rating, based on 3 loaded reviews')).toBeTruthy()
    expect(screen.queryByText(/based on 10/)).toBeNull()
  })

  it('shows an empty bucket as a zero-width bar with count 0', async () => {
    stubReviews({ 1: [reviewRow('r1', 5), reviewRow('r2', 5), reviewRow('r3', 1)] }, 3)
    render(<Reviews />)
    await waitFor(() => expect(screen.getByRole('img', { name: '4 stars: 0 reviews, 0%' })).toBeTruthy())
    expect(barWidth('4 stars: 0 reviews, 0%')).toBe('0%')
  })

  it('the bucket counts add up to the displayed review total', async () => {
    stubReviews(
      { 1: [reviewRow('r1', 5), reviewRow('r2', 3), reviewRow('r3', 3)] },
      3,
    )
    render(<Reviews />)
    await waitFor(() => expect(screen.getByRole('img', { name: '5 stars: 1 review, 33%' })).toBeTruthy())
    const scope = screen.getByText(/based on \d+ loaded reviews?/).textContent
    const displayedTotal = Number(scope.match(/based on (\d+) loaded/)[1])
    const counted = [5, 4, 3, 2, 1].reduce(
      (sum, stars) =>
        sum +
        Number(
          screen
            .getByRole('img', { name: new RegExp(`^${stars} stars?:`) })
            .getAttribute('aria-label')
            .match(/: (\d+) review/)[1],
        ),
      0,
    )
    expect(counted).toBe(displayedTotal)
  })

  it('shows the existing empty pattern and no chart when there are no reviews', async () => {
    stubReviews({ 1: [] }, 0)
    render(<Reviews />)
    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.getByText(/once clients share their experiences/i)).toBeTruthy()
    // No fabricated all-zero chart in the genuine no-reviews state.
    expect(screen.queryByRole('img', { name: /stars?: \d+ reviews?/ })).toBeNull()
    expect(screen.queryByText(/loaded reviews/)).toBeNull()
  })

  it('re-aggregates the chart when another page of reviews loads', async () => {
    stubReviews(
      {
        1: [reviewRow('r1', 5), reviewRow('r2', 5), reviewRow('r3', 5)],
        2: [reviewRow('r4', 1), reviewRow('r5', 1), reviewRow('r6', 2)],
      },
      6,
    )
    render(<Reviews />)
    await waitFor(() => expect(screen.getByRole('img', { name: '5 stars: 3 reviews, 100%' })).toBeTruthy())
    expect(screen.getByText('Average rating, based on 3 loaded reviews')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() => expect(screen.getByRole('img', { name: '1 star: 2 reviews, 67%' })).toBeTruthy())
    expect(screen.getByRole('img', { name: '2 stars: 1 review, 33%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '5 stars: 0 reviews, 0%' })).toBeTruthy()
    expect(barWidth('5 stars: 0 reviews, 0%')).toBe('0%')
    expect(screen.queryByRole('img', { name: '5 stars: 3 reviews, 100%' })).toBeNull()
  })

  it('buckets by the page rating model: overallRating first, legacy rating fallback', async () => {
    stubReviews(
      {
        1: [
          reviewRow('r1', 4.5, { rating: 5 }),
          // Grandfathered row that only carries the legacy rating.
          { id: 'r2', createdAt: '2026-09-01T10:00:00Z', rating: 3, comment: 'Old', photos: [] },
          reviewRow('r3', 2),
        ],
      },
      3,
    )
    render(<Reviews />)
    // 4.5 rounds into the 5-star bucket; the average stays precise.
    await waitFor(() => expect(screen.getByRole('img', { name: '5 stars: 1 review, 33%' })).toBeTruthy())
    expect(screen.getByRole('img', { name: '3 stars: 1 review, 33%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '2 stars: 1 review, 33%' })).toBeTruthy()
    // (4.5 + 3 + 2) / 3 = 3.2
    expect(screen.getByText('3.2')).toBeTruthy()
  })
})
