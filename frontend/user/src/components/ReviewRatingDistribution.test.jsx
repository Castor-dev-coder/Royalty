// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ReviewRatingDistribution from './ReviewRatingDistribution.jsx'

afterEach(cleanup)

function barWidth(name) {
  return screen.getByRole('img', { name }).firstElementChild.style.width
}

describe('ReviewRatingDistribution', () => {
  it('renders an uneven distribution with bars scaled to the largest bucket', () => {
    // 3x5 stars, 2x4 stars, 1x1 star: real rows, aggregated client-side.
    render(
      <ReviewRatingDistribution
        reviews={[
          { id: 'r1', overallRating: 5 },
          { id: 'r2', overallRating: 5 },
          { id: 'r3', overallRating: 5 },
          { id: 'r4', overallRating: 4 },
          { id: 'r5', overallRating: 4 },
          { id: 'r6', overallRating: 1 },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: '5 stars: 3 reviews, 50%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 stars: 2 reviews, 33%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '3 stars: 0 reviews, 0%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '2 stars: 0 reviews, 0%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 star: 1 review, 17%' })).toBeTruthy()
    // Bars are scaled to the largest bucket (the 5-star row), not to 100%.
    expect(barWidth('5 stars: 3 reviews, 50%')).toBe('100%')
    expect(barWidth('4 stars: 2 reviews, 33%')).toBe('66.7%')
    expect(barWidth('1 star: 1 review, 17%')).toBe('33.3%')
    // Average and total come from the same rows (sum 24 over 6 reviews).
    expect(screen.getByText('4.0')).toBeTruthy()
    expect(screen.getByText('Average rating, based on 6 loaded reviews')).toBeTruthy()
  })

  it('shows an empty bucket as a zero-width bar with count 0', () => {
    render(
      <ReviewRatingDistribution
        reviews={[
          { id: 'r1', overallRating: 5 },
          { id: 'r2', overallRating: 5 },
          { id: 'r3', overallRating: 1 },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: '4 stars: 0 reviews, 0%' })).toBeTruthy()
    expect(barWidth('4 stars: 0 reviews, 0%')).toBe('0%')
    // The zero bucket still states its figures as visible text.
    expect(screen.getByText('4 stars')).toBeTruthy()
  })

  it('the bucket counts add up to the displayed review total', () => {
    render(
      <ReviewRatingDistribution
        reviews={[
          { id: 'r1', overallRating: 5 },
          { id: 'r2', overallRating: 3 },
          { id: 'r3', overallRating: 3 },
          { id: 'r4', overallRating: 2 },
          { id: 'r5', overallRating: 5 },
          { id: 'r6', overallRating: 5 },
          { id: 'r7', overallRating: 5 },
          { id: 'r8', overallRating: 1 },
        ]}
      />,
    )
    const scope = screen.getByText(/based on \d+ loaded reviews?/).textContent
    const displayedTotal = Number(scope.match(/based on (\d+) loaded/)[1])
    const counted = [5, 4, 3, 2, 1].reduce(
      (sum, stars) =>
        sum + Number(screen.getByRole('img', { name: new RegExp(`^${stars} stars?:`) }).getAttribute('aria-label').match(/: (\d+) review/)[1]),
      0,
    )
    expect(displayedTotal).toBe(8)
    expect(counted).toBe(displayedTotal)
  })

  it('re-aggregates when the loaded rows change', () => {
    const { rerender } = render(
      <ReviewRatingDistribution reviews={[{ id: 'r1', overallRating: 5 }, { id: 'r2', overallRating: 5 }]} />,
    )
    expect(screen.getByRole('img', { name: '5 stars: 2 reviews, 100%' })).toBeTruthy()
    expect(screen.getByText('Average rating, based on 2 loaded reviews')).toBeTruthy()

    rerender(
      <ReviewRatingDistribution
        reviews={[
          { id: 'r3', overallRating: 2 },
          { id: 'r4', overallRating: 2 },
          { id: 'r5', overallRating: 2 },
          { id: 'r6', overallRating: 4 },
        ]}
      />,
    )
    expect(screen.queryByRole('img', { name: '5 stars: 2 reviews, 100%' })).toBeNull()
    expect(screen.getByRole('img', { name: '2 stars: 3 reviews, 75%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 stars: 1 review, 25%' })).toBeTruthy()
    expect(screen.getByText('Average rating, based on 4 loaded reviews')).toBeTruthy()
  })

  it('renders nothing when there are no reviews at all', () => {
    const { container } = render(<ReviewRatingDistribution reviews={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('uses the page rating model: overallRating first, legacy rating fallback', () => {
    render(
      <ReviewRatingDistribution
        reviews={[
          // Precise average 4.5 counts as 5 stars (the admin's rounding),
          // but the average itself stays precise.
          { id: 'r1', overallRating: 4.5, rating: 5 },
          // Grandfathered row with only the legacy rating.
          { id: 'r2', rating: 3 },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: '5 stars: 1 review, 50%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '3 stars: 1 review, 50%' })).toBeTruthy()
    // (4.5 + 3) / 2 = 3.75 -> 3.8, not the rounded-bucket mean.
    expect(screen.getByText('3.8')).toBeTruthy()
    expect(screen.getByText('Average rating, based on 2 loaded reviews')).toBeTruthy()
  })

  it('uses the API full-dataset counts when provided, regardless of loaded rows', () => {
    render(
      <ReviewRatingDistribution
        reviews={[{ id: 'r1', overallRating: 5, rating: 5 }]}
        ratingCounts={{ 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }}
        totalCount={3}
      />,
    )
    // The distribution covers all 3 reviews, not the 1 loaded row.
    expect(screen.getByRole('img', { name: '5 stars: 2 reviews, 67%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 stars: 1 review, 33%' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '3 stars: 0 reviews, 0%' })).toBeTruthy()
    expect(screen.getByText('Average star rating, across all 3 reviews')).toBeTruthy()
    // Bucket-weighted mean of the stored star ratings: (5*2 + 4) / 3 = 4.7.
    expect(screen.getByText('4.7')).toBeTruthy()
  })
})
