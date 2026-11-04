import { useMemo, useState } from 'react'
import ImageLightbox from './ImageLightBox.jsx'
import SafeImage from './SafeImage.jsx'
import { photoAltText, sortPhotos } from '../lib/reviewPhotos.js'

// A review's photos as lazy 4:3 thumbnails. Each thumbnail is a button that
// opens the keyboard-accessible lightbox on that review's photos (focus trap,
// Escape, focus return, arrow-key paging — see ImageLightBox.jsx). Alt text
// is exactly `Photo N of M from <initials>'s review`.
function ReviewPhotos({ photos, reviewerName }) {
  const sorted = useMemo(() => sortPhotos(photos), [photos])
  const [openIndex, setOpenIndex] = useState(null)
  const count = sorted.length
  const images = useMemo(
    () =>
      sorted.map((photo, index) => ({
        src: photo.url,
        alt: photoAltText({ index, count, name: reviewerName }),
      })),
    [sorted, count, reviewerName],
  )

  if (count === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {sorted.map((photo, index) => (
          <button
            className="block cursor-zoom-in overflow-hidden rounded-lg border-0 bg-transparent p-0"
            key={photo.id ?? photo.url ?? `photo-${index}`}
            onClick={() => setOpenIndex(index)}
            type="button"
          >
            <SafeImage
              alt={images[index].alt}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
              src={photo.url}
            />
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <ImageLightbox images={images} index={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  )
}

export default ReviewPhotos
