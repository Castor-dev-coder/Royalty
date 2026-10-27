import './ReviewRatingDistribution.css'

/* The rating distribution on the customer Reviews page.
 *
 * It follows the admin's chart conventions (frontend/admin charts.tsx and
 * the dashboard's service meters): plain divs and CSS bars, no chart
 * library, one labelled row per bucket with the figure at the end of the
 * row, and the same figures repeated in the bar's accessible name so the
 * chart reads without color or bar length.
 *
 * The numbers are aggregated from the review rows the page actually
 * loaded, using the page's own rating model (overallRating ?? rating) and
 * the admin's rounding for star buckets (a 4.5 review counts as 5 stars,
 * the same rounding the legacy rating field applies). Nothing is derived
 * from the average and nothing is invented: when the loaded rows change,
 * the chart changes with them.
 */

const STAR_ROWS = [5, 4, 3, 2, 1]

// The display model the review cards use: the precise average first, the
// legacy rounded rating as the fallback.
function ratingValue(row) {
  const value = Number(row?.overallRating ?? row?.rating)
  return Number.isFinite(value) ? value : null
}

function ReviewRatingDistribution({ reviews = [], ratingCounts = null, totalCount = null }) {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  let sum = 0
  if (ratingCounts) {
    // Full-dataset mode: the API aggregates the star distribution across
    // every review, so pagination cannot skew the chart.
    for (const stars of STAR_ROWS) counts[stars] = Number(ratingCounts[stars] ?? 0)
  } else {
    for (const row of reviews) {
      const value = ratingValue(row)
      if (value == null) continue
      // Star buckets are integers; 4.5 rounds to 5, matching the rounding
      // the legacy rating field stores.
      const stars = Math.min(5, Math.max(1, Math.round(value)))
      counts[stars] += 1
      sum += value
    }
  }
  const total = STAR_ROWS.reduce((count, stars) => count + counts[stars], 0)
  // A genuine no-reviews state is the page's empty pattern, not a chart of
  // five zero rows.
  if (total === 0) return null

  const maxCount = Math.max(...STAR_ROWS.map((stars) => counts[stars]))
  const average = ratingCounts
    ? (STAR_ROWS.reduce((acc, stars) => acc + stars * counts[stars], 0) / total).toFixed(1)
    : (sum / total).toFixed(1)
  const scopeText = ratingCounts
    ? `Average star rating, across all ${totalCount ?? total} reviews`
    : `Average rating, based on ${total} loaded ${total === 1 ? 'review' : 'reviews'}`

  return (
    <div className="rating-dist">
      <p className="rating-dist-summary">
        <strong className="rating-dist-average">{average}</strong>
        <span className="rating-dist-scope">{scopeText}</span>
      </p>
      <ul className="rating-dist-rows">
        {STAR_ROWS.map((stars) => {
          const count = counts[stars]
          const percent = Math.round((count / total) * 100)
          const starLabel = `${stars} ${stars === 1 ? 'star' : 'stars'}`
          const reviewWord = count === 1 ? 'review' : 'reviews'
          return (
            <li className="rating-dist-row" key={stars}>
              <span className="rating-dist-label">{starLabel}</span>
              <span
                aria-label={`${starLabel}: ${count} ${reviewWord}, ${percent}%`}
                className="rating-dist-track"
                role="img"
              >
                <span
                  className="rating-dist-fill"
                  style={{ width: `${((count / maxCount) * 100).toFixed(1)}%` }}
                />
              </span>
              <span className="rating-dist-value">
                {count}
                <span className="rating-dist-percent">{percent}%</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ReviewRatingDistribution
