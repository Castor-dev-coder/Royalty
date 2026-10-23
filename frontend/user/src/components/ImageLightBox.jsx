import Dialog from './Dialog.jsx'
import SafeImage from './SafeImage.jsx'

function ImageLightbox({ src, alt = '', onClose }) {
  return (
    <Dialog
      backdropClassName="bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out"
      labelledBy="image-lightbox-title"
      onClose={onClose}
      panelClassName="relative max-h-[90vh] max-w-[min(92vw,1100px)]"
    >
      <h2 className="sr-only" id="image-lightbox-title">Enlarged image</h2>
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
        alt={alt}
        className="max-h-[90vh] max-w-[min(92vw,1100px)] cursor-default rounded-[6px] object-contain"
        src={src}
      />
    </Dialog>
  )
}

export default ImageLightbox