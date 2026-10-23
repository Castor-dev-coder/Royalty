import SafeImage from './SafeImage.jsx'

import { useState } from 'react'
import ImageLightbox from './ImageLightBox.jsx'

function StarIcon({ filled = true }) {
  return (
    <svg className="size-3.75" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.7 14.9 8.2 22 8.9 16.7 13.8 18.4 21 12 17.2 5.6 21 7.3 13.8 2 8.9 9.1 8.2 12 1.7Z"
        fill={filled ? '#d4b45c' : '#403a34'}
        stroke={filled ? '#d4b45c' : '#403a34'}
        strokeWidth="0.7"
      />
    </svg>
  )
}

function RatingStars({ value }) {
  const fullStars = Math.floor(value)
  const hasHalfStar = value - fullStars >= 0.5

  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        if (index < fullStars) return <StarIcon key={`star-${index}`} filled />
        if (index === fullStars && hasHalfStar) {
          return (
            <svg className="size-3.75" viewBox="0 0 24 24" aria-hidden="true" key={`half-${index}`}>
              <defs>
                <linearGradient id={`half-star-${index}`}>
                  <stop offset="50%" stopColor="#d4b45c" />
                  <stop offset="50%" stopColor="#403a34" />
                </linearGradient>
              </defs>
              <path
                d="M12 1.7 14.9 8.2 22 8.9 16.7 13.8 18.4 21 12 17.2 5.6 21 7.3 13.8 2 8.9 9.1 8.2 12 1.7Z"
                fill={`url(#half-star-${index})`}
                stroke="#d4b45c"
                strokeWidth="0.7"
              />
            </svg>
          )
        }
        return <StarIcon key={`star-empty-${index}`} filled={false} />
      })}
    </div>
  )
}

function ReviewCard({ name, avatar, date, rating, category, text, images = [] }) {
  const [zoomedImage, setZoomedImage] = useState(null)

  return (
    <article className="overflow-hidden rounded-2xl border border-(--line) bg-(--review-panel) shadow-[0_0_0_1px_rgba(212,180,92,0.06)]">
      {images.length > 0 && (
      <div className="grid grid-cols-3 gap-2 border-b border-[rgba(212,180,92,0.2)] p-2.5">
        {images.map((image, index) => (
          <button
            aria-label={`Enlarge ${name} review image ${index + 1}`}
            className="block cursor-zoom-in overflow-hidden rounded-lg p-0"
            key={`${name}-${index}`}
            onClick={() => setZoomedImage({ src: image, alt: `${name} review image ${index + 1}` })}
            type="button"
          >
            <SafeImage
              alt={`${name} review image ${index + 1}`}
              className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.06]"
              src={image}
            />
          </button>
        ))}
      </div>
      )}

      <div className="p-[18px_18px_16px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <SafeImage
              alt={`${name} avatar`}
              className="size-11 rounded-full object-cover ring-2 ring-line"
              src={avatar}
            />
            <div>
              <div className="text-lg font-semibold text-(--text)">{name}</div>
              {date && (
                <div className="mt-1 text-[13px] uppercase tracking-[0.06em] text-(--muted)">{date}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <RatingStars value={rating} />
            <span className="text-[15px] font-semibold text-(--gold)">{Number(rating).toFixed(1)}</span>
          </div>
        </div>

        {category && (
          <div className="mt-4.5 inline-flex rounded-full border border-(--gold) bg-[rgba(212,180,92,0.08)] px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-(--gold)">
            {category}
          </div>
        )}

        <p className="mt-4 text-[16px] leading-[1.75] text-[#d5d0c8]">{text}</p>
      </div>

      {zoomedImage && (
        <ImageLightbox
          alt={zoomedImage.alt}
          onClose={() => setZoomedImage(null)}
          src={zoomedImage.src}
        />
      )}
    </article>
  )
}

export default ReviewCard