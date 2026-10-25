import { useEffect, useState } from 'react'
import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'

// Keyboard-accessible lightbox over one review's photos. Dialog supplies the
// focus move-in, focus trap, Escape-to-close, and focus restoration to the
// thumbnail that opened it; left/right arrows (and the prev/next buttons)
// walk the photos of that same review.
function ImageLightbox({ images = [], index = 0, onClose }) {
  const count = images.length
  const [current, setCurrent] = useState(Math.min(Math.max(index, 0), Math.max(count - 1, 0)))

  useEffect(() => {
    if (count < 2) return undefined
    function handleKeyDown(event) {
      if (event.key === 'ArrowRight') setCurrent((value) => (value + 1) % count)
      else if (event.key === 'ArrowLeft') setCurrent((value) => (value - 1 + count) % count)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [count])

  const photo = images[current] ?? { src: '', alt: '' }

  return (
    <Dialog
      backdropClassName="bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out"
      labelledBy="image-lightbox-title"
      onClose={onClose}
      panelClassName="relative max-h-[90vh] max-w-[min(92vw,1100px)]"
    >
      <h2 className="sr-only" id="image-lightbox-title">Enlarged review photo</h2>
      <button
        aria-label="Close image"
        className="absolute top-4 right-4 z-[1] grid size-10 cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-black/60 text-[var(--gold)] transition-colors hover:bg-[var(--gold)] hover:text-[#111]"
        onClick={onClose}
        type="button"
      >
        <svg className="w-5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <SafeImage
        alt={photo.alt}
        className="mx-auto block max-h-[90vh] max-w-[min(92vw,1100px)] cursor-default rounded-[6px] object-contain"
        key={photo.src}
        src={photo.src}
      />
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            aria-label="Previous photo"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-black/60 text-[var(--gold)] transition-colors hover:bg-[var(--gold)] hover:text-[#111]"
            onClick={() => setCurrent((value) => (value - 1 + count) % count)}
            type="button"
          >
            <svg className="w-4.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-[13px] tracking-[0.12em] text-[#d8d4cb] uppercase" role="status">
            Photo {current + 1} of {count}
          </span>
          <button
            aria-label="Next photo"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-black/60 text-[var(--gold)] transition-colors hover:bg-[var(--gold)] hover:text-[#111]"
            onClick={() => setCurrent((value) => (value + 1) % count)}
            type="button"
          >
            <svg className="w-4.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </Dialog>
  )
}

export default ImageLightbox
