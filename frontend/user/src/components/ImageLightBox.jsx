import { useEffect } from 'react'
import { createPortal } from 'react-dom'

function ImageLightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return createPortal(
    <div
      aria-label="Enlarged image"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="Close image"
        className="absolute top-4 right-4 grid size-10 cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-black/60 text-[var(--gold)] transition-colors hover:bg-[var(--gold)] hover:text-[#111]"
        onClick={onClose}
        type="button"
      >
        <svg className="w-5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <img
        alt={alt}
        className="max-h-[90vh] max-w-[min(92vw,1100px)] cursor-default rounded-[6px] object-contain"
        onClick={(event) => event.stopPropagation()}
        src={src}
      />
    </div>,
    document.body,
  )
}

export default ImageLightbox